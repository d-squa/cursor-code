// Creative Editor Dialog for editing creative details
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Image as ImageIcon, 
  FileVideo, 
  Link2,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import type { Creative, Platform, CreativeStatus, CallToAction } from '@/types/creative';
import { PLATFORM_SPECS, validateCreative, VALID_FUNNEL_STAGES } from '@/utils/creativeValidation';
import { cn } from '@/lib/utils';

interface CreativeEditorProps {
  creative: Creative | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<Creative>) => Promise<void>;
  isSaving?: boolean;
}

const STATUS_OPTIONS: CreativeStatus[] = ['draft', 'ready', 'needs_review', 'error', 'published'];

export function CreativeEditor({
  creative,
  open,
  onOpenChange,
  onSave,
  isSaving = false,
}: CreativeEditorProps) {
  const [formData, setFormData] = useState<Partial<Creative>>({});
  const [activeTab, setActiveTab] = useState('basic');
  const [validation, setValidation] = useState<ReturnType<typeof validateCreative> | null>(null);

  // Initialize form data when creative changes
  useEffect(() => {
    if (creative) {
      setFormData({ ...creative });
      setValidation(validateCreative(creative));
    } else {
      setFormData({});
      setValidation(null);
    }
  }, [creative]);

  // Validate on form change
  useEffect(() => {
    if (Object.keys(formData).length > 0) {
      setValidation(validateCreative(formData));
    }
  }, [formData]);

  const handleChange = (field: keyof Creative, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    await onSave(formData);
  };

  const platformSpecs = formData.platform ? PLATFORM_SPECS[formData.platform as Platform] : null;

  if (!creative) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Creative</DialogTitle>
          <DialogDescription>
            Update creative details and mapping for ActiPlan
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="copy">Copy & CTA</TabsTrigger>
            <TabsTrigger value="mapping">Mapping</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 pr-4">
            <TabsContent value="basic" className="space-y-4 mt-0">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Creative Name *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter creative name"
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => handleChange('status', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status} className="capitalize">
                        {status.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Platform */}
              <div className="space-y-2">
                <Label>Platform *</Label>
                <Select
                  value={formData.platform}
                  onValueChange={(v) => handleChange('platform', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta">Meta</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="snapchat">Snapchat</SelectItem>
                    <SelectItem value="pinterest">Pinterest</SelectItem>
                    <SelectItem value="x">X</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Creative Type */}
              <div className="space-y-2">
                <Label>Creative Type</Label>
                <Select
                  value={formData.creativeType}
                  onValueChange={(v) => handleChange('creativeType', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark_post">Dark Post</SelectItem>
                    <SelectItem value="existing_post">Existing Post</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="carousel">Carousel</SelectItem>
                    <SelectItem value="collection">Collection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Media URL */}
              {formData.creativeType !== 'existing_post' && (
                <div className="space-y-2">
                  <Label>Media URL</Label>
                  <Input
                    value={formData.mediaUrls?.[0] || ''}
                    onChange={(e) => handleChange('mediaUrls', [e.target.value])}
                    placeholder="https://..."
                  />
                </div>
              )}

              {/* External Post ID (for existing posts) */}
              {formData.creativeType === 'existing_post' && (
                <>
                  <div className="space-y-2">
                    <Label>Post ID *</Label>
                    <Input
                      value={formData.externalPostId || ''}
                      onChange={(e) => handleChange('externalPostId', e.target.value)}
                      placeholder="Enter post ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Page ID</Label>
                    <Input
                      value={formData.externalPageId || ''}
                      onChange={(e) => handleChange('externalPageId', e.target.value)}
                      placeholder="Enter page ID"
                    />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="copy" className="space-y-4 mt-0">
              {/* Primary Text */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Primary Text</Label>
                  {platformSpecs && (
                    <span className="text-xs text-muted-foreground">
                      {formData.primaryText?.length || 0}/{platformSpecs.textLimits.primaryText.max}
                    </span>
                  )}
                </div>
                <Textarea
                  value={formData.primaryText || ''}
                  onChange={(e) => handleChange('primaryText', e.target.value)}
                  placeholder="Enter primary ad text"
                  rows={4}
                />
              </div>

              {/* Headline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Headline</Label>
                  {platformSpecs && (
                    <span className="text-xs text-muted-foreground">
                      {formData.headline?.length || 0}/{platformSpecs.textLimits.headline.max}
                    </span>
                  )}
                </div>
                <Input
                  value={formData.headline || ''}
                  onChange={(e) => handleChange('headline', e.target.value)}
                  placeholder="Enter headline"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  {platformSpecs && (
                    <span className="text-xs text-muted-foreground">
                      {formData.description?.length || 0}/{platformSpecs.textLimits.description.max}
                    </span>
                  )}
                </div>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Enter description"
                  rows={2}
                />
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <Label>Caption</Label>
                <Textarea
                  value={formData.caption || ''}
                  onChange={(e) => handleChange('caption', e.target.value)}
                  placeholder="Enter caption (optional)"
                  rows={2}
                />
              </div>

              {/* Call to Action */}
              <div className="space-y-2">
                <Label>Call to Action</Label>
                <Select
                  value={formData.callToAction || ''}
                  onValueChange={(v) => handleChange('callToAction', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select CTA" />
                  </SelectTrigger>
                  <SelectContent>
                    {(platformSpecs?.callToActions || [
                      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
                      'CONTACT_US', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW'
                    ]).map((cta) => (
                      <SelectItem key={cta} value={cta}>
                        {cta.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Destination URL */}
              <div className="space-y-2">
                <Label>Destination URL</Label>
                <Input
                  value={formData.destinationUrl || ''}
                  onChange={(e) => handleChange('destinationUrl', e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </div>
            </TabsContent>

            <TabsContent value="mapping" className="space-y-4 mt-0">
              {/* Market */}
              <div className="space-y-2">
                <Label>Market (Country Code)</Label>
                <Input
                  value={formData.market || ''}
                  onChange={(e) => handleChange('market', e.target.value.toUpperCase())}
                  placeholder="US, UK, DE, etc."
                  maxLength={2}
                />
              </div>

              {/* Funnel Phase */}
              <div className="space-y-2">
                <Label>Funnel Phase</Label>
                <Select
                  value={formData.phaseName || ''}
                  onValueChange={(v) => handleChange('phaseName', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_FUNNEL_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Optimization Goal */}
              <div className="space-y-2">
                <Label>Optimization Goal</Label>
                <Input
                  value={formData.optimizationGoal || ''}
                  onChange={(e) => handleChange('optimizationGoal', e.target.value.toUpperCase())}
                  placeholder="CONVERSIONS, REACH, VIDEO_VIEWS, etc."
                />
                {formData.platform && (
                  <p className="text-xs text-muted-foreground">
                    Valid for {formData.platform}: {PLATFORM_SPECS[formData.platform as Platform] ? 
                      (platformSpecs as any)?.callToActions?.slice(0, 5).join(', ') + '...' : 'N/A'}
                  </p>
                )}
              </div>

              {/* Funnel Stage */}
              <div className="space-y-2">
                <Label>Funnel Stage</Label>
                <Select
                  value={formData.funnelStage || ''}
                  onValueChange={(v) => handleChange('funnelStage', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select funnel stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Top of Funnel</SelectItem>
                    <SelectItem value="middle">Middle of Funnel</SelectItem>
                    <SelectItem value="bottom">Bottom of Funnel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 mt-0">
              {/* Media Preview */}
              <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                {formData.mediaUrls?.[0] ? (
                  formData.creativeType === 'video' ? (
                    <video
                      src={formData.mediaUrls[0]}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={formData.mediaUrls[0]}
                      alt={formData.name}
                      className="w-full h-full object-contain"
                    />
                  )
                ) : (
                  <div className="text-center text-muted-foreground">
                    {formData.creativeType === 'video' ? (
                      <FileVideo className="h-12 w-12 mx-auto mb-2" />
                    ) : (
                      <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                    )}
                    <p>No media</p>
                  </div>
                )}
              </div>

              {/* Dimensions */}
              {formData.width && formData.height && (
                <div className="flex gap-2">
                  <Badge variant="outline">
                    {formData.width} × {formData.height}
                  </Badge>
                  {formData.aspectRatio && (
                    <Badge variant="outline">{formData.aspectRatio}</Badge>
                  )}
                </div>
              )}

              {/* Validation Summary */}
              {validation && (
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    {validation.isValid ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    Validation
                  </h4>
                  
                  {validation.errors.length > 0 && (
                    <div className="p-3 bg-destructive/10 rounded-md text-sm">
                      <p className="font-medium text-destructive">Errors:</p>
                      <ul className="list-disc list-inside text-destructive">
                        {validation.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {validation.warnings.length > 0 && (
                    <div className="p-3 bg-yellow-500/10 rounded-md text-sm">
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">Warnings:</p>
                      <ul className="list-disc list-inside text-yellow-700 dark:text-yellow-400">
                        {validation.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {validation.suggestions.length > 0 && (
                    <div className="p-3 bg-blue-500/10 rounded-md text-sm">
                      <p className="font-medium text-blue-700 dark:text-blue-400">Suggestions:</p>
                      <ul className="list-disc list-inside text-blue-700 dark:text-blue-400">
                        {validation.suggestions.map((sug, i) => (
                          <li key={i}>{sug}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
