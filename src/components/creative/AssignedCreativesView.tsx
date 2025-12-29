import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ChevronDown, ChevronRight, Image, Video, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CreativeAssignment {
  id: string;
  creative_id: string;
  campaign_id: string;
  platform: string;
  market: string;
  phase_name: string;
  position: number;
  status: string;
  dsp_creative_id: string | null;
  error_message: string | null;
  assigned_at: string;
  creative: {
    id: string;
    name: string;
    media_type: string | null;
    aspect_ratio: string | null;
    thumbnail_url: string | null;
    media_urls: string[] | null;
    width: number | null;
    height: number | null;
    duration_seconds: number | null;
    primary_text: string | null;
    headline: string | null;
    call_to_action: string | null;
    status: string;
  } | null;
}

interface GroupedAssignments {
  [platform: string]: {
    [market: string]: {
      [phase: string]: CreativeAssignment[];
    };
  };
}

interface AssignedCreativesViewProps {
  campaignId: string;
  onRefresh?: () => void;
}

export function AssignedCreativesView({ campaignId, onRefresh }: AssignedCreativesViewProps) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<CreativeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
  }, [campaignId, user?.id]);

  const loadAssignments = async () => {
    if (!campaignId || !user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('creative_assignments')
        .select(`
          *,
          creative:creatives(
            id, name, media_type, aspect_ratio, thumbnail_url, media_urls,
            width, height, duration_seconds, primary_text, headline, call_to_action, status
          )
        `)
        .eq('campaign_id', campaignId)
        .order('platform')
        .order('market')
        .order('phase_name')
        .order('position');

      if (error) throw error;

      setAssignments(data || []);
      
      // Auto-expand all platforms
      const platforms = new Set((data || []).map((a: CreativeAssignment) => a.platform));
      setExpandedPlatforms(platforms);
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Failed to load creative assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      setDeleting(assignmentId);
      const { error } = await supabase
        .from('creative_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      toast.success('Creative assignment removed');
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast.error('Failed to remove assignment');
    } finally {
      setDeleting(null);
    }
  };

  const togglePlatform = (platform: string) => {
    const newExpanded = new Set(expandedPlatforms);
    if (newExpanded.has(platform)) {
      newExpanded.delete(platform);
    } else {
      newExpanded.add(platform);
    }
    setExpandedPlatforms(newExpanded);
  };

  const toggleMarket = (key: string) => {
    const newExpanded = new Set(expandedMarkets);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMarkets(newExpanded);
  };

  // Group assignments by platform > market > phase
  const groupedAssignments = assignments.reduce((acc, assignment) => {
    const { platform, market, phase_name } = assignment;
    const phase = phase_name || 'Default';
    
    if (!acc[platform]) acc[platform] = {};
    if (!acc[platform][market]) acc[platform][market] = {};
    if (!acc[platform][market][phase]) acc[platform][market][phase] = [];
    
    acc[platform][market][phase].push(assignment);
    return acc;
  }, {} as GroupedAssignments);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'pushed':
        return <Badge variant="default">Pushed</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Assigned Creatives
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No creatives assigned to this ActiPlan yet.</p>
            <p className="text-sm mt-1">Use the Creative Matcher to assign creatives to your campaign structure.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Assigned Creatives ({assignments.length})
        </CardTitle>
        <Button variant="outline" size="sm" onClick={loadAssignments}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedAssignments).map(([platform, markets]) => (
          <Collapsible
            key={platform}
            open={expandedPlatforms.has(platform)}
            onOpenChange={() => togglePlatform(platform)}
          >
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                {expandedPlatforms.has(platform) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-semibold">{platform}</span>
                <Badge variant="outline" className="ml-auto">
                  {Object.values(markets).flatMap(m => Object.values(m).flat()).length} creatives
                </Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 pt-2 space-y-2">
              {Object.entries(markets).map(([market, phases]) => {
                const marketKey = `${platform}-${market}`;
                return (
                  <Collapsible
                    key={marketKey}
                    open={expandedMarkets.has(marketKey)}
                    onOpenChange={() => toggleMarket(marketKey)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/30 transition-colors">
                        {expandedMarkets.has(marketKey) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className="text-sm font-medium">{market}</span>
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {Object.values(phases).flat().length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 pt-1 space-y-3">
                      {Object.entries(phases).map(([phase, phaseAssignments]) => (
                        <div key={phase} className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {phase}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {phaseAssignments.map((assignment) => (
                              <CreativeCard
                                key={assignment.id}
                                assignment={assignment}
                                onRemove={() => handleRemoveAssignment(assignment.id)}
                                isDeleting={deleting === assignment.id}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}

interface CreativeCardProps {
  assignment: CreativeAssignment;
  onRemove: () => void;
  isDeleting: boolean;
}

function CreativeCard({ assignment, onRemove, isDeleting }: CreativeCardProps) {
  const creative = assignment.creative;
  
  if (!creative) {
    return (
      <div className="p-3 border rounded-lg bg-destructive/5 border-destructive/20">
        <p className="text-sm text-destructive">Creative not found</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isDeleting}
          className="mt-2"
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          <span className="ml-1">Remove</span>
        </Button>
      </div>
    );
  }

  const isVideo = creative.media_type === 'video';
  const thumbnailUrl = creative.thumbnail_url || (creative.media_urls?.[0]);

  return (
    <div className="p-3 border rounded-lg hover:border-primary/50 transition-colors group">
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0 relative">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={creative.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isVideo ? <Video className="h-6 w-6 text-muted-foreground" /> : <Image className="h-6 w-6 text-muted-foreground" />}
            </div>
          )}
          {isVideo && (
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
              {creative.duration_seconds ? `${creative.duration_seconds}s` : 'Video'}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={creative.name}>
            {creative.name}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {creative.aspect_ratio && <span>{creative.aspect_ratio}</span>}
            {creative.width && creative.height && (
              <span>{creative.width}×{creative.height}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {assignment.status === 'pushed' && assignment.dsp_creative_id ? (
              <Badge variant="default" className="text-xs">Pushed</Badge>
            ) : assignment.status === 'error' ? (
              <Badge variant="destructive" className="text-xs">Error</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Pending</Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRemove}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3 text-destructive" />
            )}
          </Button>
        </div>
      </div>

      {/* Error message */}
      {assignment.error_message && (
        <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
          {assignment.error_message}
        </div>
      )}
    </div>
  );
}
