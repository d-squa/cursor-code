// Carousel Creator Component
// Allows multi-selecting creatives within an ad set to link as carousel cards

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GripVertical, Image, Video, X, Plus, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import type { CarouselLink, CarouselCard } from '@/types/carouselTypes';

interface CarouselCreatorProps {
  selectedRows: CreativeTextAssetRow[];
  onCreateCarousel: (carousel: CarouselLink) => void;
  onCancel: () => void;
  open: boolean;
}

export function CarouselCreator({ selectedRows, onCreateCarousel, onCancel, open }: CarouselCreatorProps) {
  const [carouselName, setCarouselName] = useState('');
  const [orderedCards, setOrderedCards] = useState<CreativeTextAssetRow[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Sync orderedCards when dialog opens or selectedRows changes
  useEffect(() => {
    if (open && selectedRows.length > 0) {
      setOrderedCards(selectedRows);
    }
  }, [open, selectedRows]);
  // Validate all selected are from same ad set
  const adSetNames = [...new Set(selectedRows.map(r => r.adSet))];
  const isSameAdSet = adSetNames.length === 1;
  const adSetName = adSetNames[0] || 'Unknown';

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

  // Create carousel
  const handleCreate = useCallback(() => {
    if (!carouselName.trim() || orderedCards.length < 2) return;
    
    const carousel: CarouselLink = {
      id: crypto.randomUUID(),
      carouselName: carouselName.trim(),
      adSetId: orderedCards[0]?.assignmentId.split('_')[0] || '',
      adSetName,
      platform: orderedCards[0]?.platform || 'meta',
      market: orderedCards[0]?.market || '',
      phase: orderedCards[0]?.phase || '',
      cardIds: orderedCards.map(r => r.id),
    };
    
    onCreateCarousel(carousel);
  }, [carouselName, orderedCards, adSetName, onCreateCarousel]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Create Carousel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Validation warning */}
          {!isSameAdSet && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
              Selected creatives must be from the same ad set. Found: {adSetNames.join(', ')}
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
            <label className="text-sm font-medium">Card Order (drag to reorder)</label>
            <div className="space-y-1 border rounded-md p-2 bg-muted/30">
              {orderedCards.map((row, index) => (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-2 p-2 bg-background rounded border cursor-move",
                    draggedIndex === index && "opacity-50"
                  )}
                >
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
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum 2 cards required. Drag cards or type position numbers to reorder.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!isSameAdSet || !carouselName.trim() || orderedCards.length < 2}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Carousel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
