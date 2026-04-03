import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Loader2,
  GripVertical,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_QC_CHECKLISTS,
  CROSS_PLATFORM_CHECKLIST,
  PLATFORM_DISPLAY_NAMES,
  type QCChecklistItem,
  type PlatformKey,
} from "@/config/qcChecklists";

interface ClientQCChecklistEditorProps {
  clientId: string;
}

type EntityType = 'campaign' | 'adset' | 'ad';

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  campaign: 'Campaign',
  adset: 'Ad Set / Ad Group',
  ad: 'Ad',
};

export function ClientQCChecklistEditor({ clientId }: ClientQCChecklistEditorProps) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customChecklists, setCustomChecklists] = useState<Record<string, QCChecklistItem[]>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [activePlatform, setActivePlatform] = useState<PlatformKey>('meta');
  const [enforceIndividual, setEnforceIndividual] = useState(false);

  const fetchCustomChecklists = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [checklistRes, clientRes] = await Promise.all([
        supabase.from("client_qc_checklists").select("*").eq("client_id", clientId),
        supabase.from("clients").select("qc_enforce_individual").eq("id", clientId).single(),
      ]);

      if (checklistRes.data) {
        const map: Record<string, QCChecklistItem[]> = {};
        (checklistRes.data as any[]).forEach(c => {
          map[`${c.platform}_${c.entity_type}`] = c.items as QCChecklistItem[];
        });
        setCustomChecklists(map);
      }
      if (clientRes.data) {
        setEnforceIndividual((clientRes.data as any).qc_enforce_individual ?? false);
      }
    } catch (error) {
      console.error("Error fetching client QC checklists:", error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCustomChecklists();
  }, [fetchCustomChecklists]);

  const getItems = (platform: PlatformKey, entityType: EntityType): QCChecklistItem[] => {
    const key = `${platform}_${entityType}`;
    if (customChecklists[key]) return customChecklists[key];
    return DEFAULT_QC_CHECKLISTS[platform]?.[entityType] || [];
  };

  const isCustomized = (platform: PlatformKey, entityType: EntityType): boolean => {
    return !!customChecklists[`${platform}_${entityType}`];
  };

  const updateItems = (platform: PlatformKey, entityType: EntityType, items: QCChecklistItem[]) => {
    const key = `${platform}_${entityType}`;
    setCustomChecklists(prev => ({ ...prev, [key]: items }));
  };

  const addItem = (platform: PlatformKey, entityType: EntityType) => {
    const items = getItems(platform, entityType);
    const newItem: QCChecklistItem = {
      key: `custom_${Date.now()}`,
      label: '',
      description: '',
    };
    updateItems(platform, entityType, [...items, newItem]);
  };

  const removeItem = (platform: PlatformKey, entityType: EntityType, index: number) => {
    const items = getItems(platform, entityType);
    updateItems(platform, entityType, items.filter((_, i) => i !== index));
  };

  const updateItem = (platform: PlatformKey, entityType: EntityType, index: number, field: keyof QCChecklistItem, value: string) => {
    const items = [...getItems(platform, entityType)];
    items[index] = { ...items[index], [field]: value };
    updateItems(platform, entityType, items);
  };

  const resetToDefault = (platform: PlatformKey, entityType: EntityType) => {
    const key = `${platform}_${entityType}`;
    setCustomChecklists(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Save enforce setting on client
      await supabase.from("clients").update({ qc_enforce_individual: enforceIndividual } as any).eq("id", clientId);

      // Delete existing custom checklists for this client
      await supabase
        .from("client_qc_checklists")
        .delete()
        .eq("client_id", clientId);

      // Insert all customized checklists
      const inserts: any[] = [];
      for (const [key, items] of Object.entries(customChecklists)) {
        const [platform, entityType] = key.split('_');
        inserts.push({
          client_id: clientId,
          platform,
          entity_type: entityType,
          items,
          user_id: user.id,
          team_id: activeWorkspace?.id || null,
        });
      }

      if (inserts.length > 0) {
        const { error } = await supabase
          .from("client_qc_checklists")
          .insert(inserts);
        if (error) throw error;
      }

      toast.success("QC checklists saved successfully");
    } catch (error: any) {
      console.error("Error saving QC checklists:", error);
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const platforms = Object.keys(DEFAULT_QC_CHECKLISTS) as PlatformKey[];
  const entityTypes: EntityType[] = ['campaign', 'adset', 'ad'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            QC Checklists
          </CardTitle>
          <Button onClick={saveAll} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save Changes
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Customize QC checklists per platform. Items not customized will use defaults.
        </p>
        <div className="flex items-center gap-3 mt-2 p-2 bg-muted/30 rounded-md">
          <Switch
            checked={enforceIndividual}
            onCheckedChange={setEnforceIndividual}
          />
          <div>
            <Label className="text-xs font-medium">Enforce Individual Checking</Label>
            <p className="text-[10px] text-muted-foreground">When enabled, "Check All" bulk actions are disabled — each item must be reviewed one by one.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activePlatform} onValueChange={(v) => setActivePlatform(v as PlatformKey)}>
          <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
            {platforms.map(p => (
              <TabsTrigger key={p} value={p} className="text-xs px-2 py-1">
                {PLATFORM_DISPLAY_NAMES[p]}
              </TabsTrigger>
            ))}
          </TabsList>

          {platforms.map(platform => (
            <TabsContent key={platform} value={platform} className="space-y-3 mt-3">
              {entityTypes.map(entityType => {
                const sectionKey = `${platform}_${entityType}`;
                const isOpen = expandedSections[sectionKey] ?? false;
                const items = getItems(platform, entityType);
                const customized = isCustomized(platform, entityType);

                return (
                  <Collapsible key={sectionKey} open={isOpen} onOpenChange={() => toggleSection(sectionKey)}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md text-sm">
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium">{ENTITY_TYPE_LABELS[entityType]}</span>
                        <Badge variant="outline" className="text-xs">{items.length} items</Badge>
                        {customized && (
                          <Badge variant="secondary" className="text-xs">Customized</Badge>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 mt-2 space-y-2">
                        {items.map((item, idx) => (
                          <div key={item.key} className="flex items-start gap-2 p-2 bg-muted/20 rounded border">
                            <GripVertical className="h-4 w-4 text-muted-foreground mt-1.5 shrink-0 cursor-grab" />
                            <div className="flex-1 space-y-1">
                              <Input
                                value={item.label}
                                onChange={(e) => {
                                  if (!customized) {
                                    // First edit = create a custom copy
                                    updateItems(platform, entityType, [...items]);
                                  }
                                  updateItem(platform, entityType, idx, 'label', e.target.value);
                                }}
                                placeholder="Check item label"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={item.description}
                                onChange={(e) => {
                                  if (!customized) {
                                    updateItems(platform, entityType, [...items]);
                                  }
                                  updateItem(platform, entityType, idx, 'description', e.target.value);
                                }}
                                placeholder="Description / notes"
                                className="h-7 text-xs"
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => {
                                if (!customized) {
                                  updateItems(platform, entityType, [...items]);
                                }
                                removeItem(platform, entityType, idx);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              if (!customized) {
                                updateItems(platform, entityType, [...items]);
                              }
                              addItem(platform, entityType);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Item
                          </Button>
                          {customized && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-amber-600"
                              onClick={() => resetToDefault(platform, entityType)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset to Default
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Cross-Platform Items (read-only reference) */}
              <Separator className="my-3" />
              <div className="p-2 bg-muted/10 rounded">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Cross-Platform Items (added automatically to Campaign level)
                </div>
                <div className="text-xs text-muted-foreground">
                  {CROSS_PLATFORM_CHECKLIST.length} items covering Pre-Launch, Tracking, Account, Post-Launch & Documentation
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
