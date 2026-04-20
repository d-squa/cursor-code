import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2, Save, BarChart3 } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface OperationDefault {
  id?: string;
  client_id: string;
  operation_type: string;
  operation_subtype: string;
  estimated_hours: number;
}

interface OperationsMeasurementsTabProps {
  clientId: string;
}

const CHANGE_REQUEST_TYPES = [
  { value: 'budget_increase', label: 'Budget Increase', defaultHours: 0.5 },
  { value: 'budget_decrease', label: 'Budget Decrease', defaultHours: 0.5 },
  { value: 'duration_extension', label: 'Duration Extension', defaultHours: 1 },
  { value: 'market_expansion', label: 'Market Expansion', defaultHours: 2 },
  { value: 'targeting_change', label: 'Targeting Change', defaultHours: 1.5 },
  { value: 'goals_update', label: 'Goals/KPI Update', defaultHours: 1 },
  { value: 'creative_change', label: 'Creative Change', defaultHours: 1.5 },
  { value: 'pause_request', label: 'Pause Request', defaultHours: 0.5 },
  { value: 'other', label: 'Other', defaultHours: 1 },
];

const SUBMIT_REQUEST_TYPES = [
  { value: 'budget_change', label: 'Budget Change', defaultHours: 0.5 },
  { value: 'creative_optimization', label: 'Creative Optimization', defaultHours: 2 },
  { value: 'pause_enable_campaigns', label: 'Pause/Enable Campaigns', defaultHours: 0.5 },
  { value: 'targeting_optimization', label: 'Targeting Optimization', defaultHours: 1.5 },
  { value: 'audience_expansion', label: 'Audience Expansion', defaultHours: 1.5 },
  { value: 'bid_adjustment', label: 'Bid Adjustment', defaultHours: 0.5 },
  { value: 'schedule_change', label: 'Schedule Change', defaultHours: 0.5 },
  { value: 'landing_page_update', label: 'Landing Page Update', defaultHours: 1 },
  { value: 'ad_copy_update', label: 'Ad Copy Update', defaultHours: 1 },
  { value: 'placement_change', label: 'Placement Change', defaultHours: 1 },
  { value: 'conversion_tracking', label: 'Conversion Tracking Setup', defaultHours: 2 },
  { value: 'pixel_implementation', label: 'Pixel Implementation', defaultHours: 1.5 },
  { value: 'reporting_request', label: 'Reporting Request', defaultHours: 1 },
  { value: 'other', label: 'Other', defaultHours: 1 },
];

const LOGGED_ACTION_TYPES = [
  { value: 'budget_adjustment', label: 'Budget Adjustment', defaultHours: 0.5 },
  { value: 'targeting_change', label: 'Targeting Change', defaultHours: 1 },
  { value: 'creative_update', label: 'Creative Update', defaultHours: 1.5 },
  { value: 'campaign_pause_resume', label: 'Campaign Pause/Resume', defaultHours: 0.25 },
  { value: 'audience_update', label: 'Audience Update', defaultHours: 1 },
  { value: 'bid_change', label: 'Bid Change', defaultHours: 0.5 },
  { value: 'schedule_modification', label: 'Schedule Modification', defaultHours: 0.5 },
  { value: 'landing_page_change', label: 'Landing Page Change', defaultHours: 0.5 },
  { value: 'ad_copy_change', label: 'Ad Copy Change', defaultHours: 0.5 },
  { value: 'placement_update', label: 'Placement Update', defaultHours: 0.5 },
  { value: 'conversion_setup', label: 'Conversion Setup', defaultHours: 1.5 },
  { value: 'reporting_delivery', label: 'Reporting Delivery', defaultHours: 1 },
  { value: 'note', label: 'Note/Comment', defaultHours: 0.25 },
];

interface LocalDefault {
  id?: string;
  client_id: string;
  operation_type: string;
  operation_subtype: string;
  label: string;
  estimated_hours: number | null;
  defaultHours: number;
  localValue: string;
  isDirty: boolean;
}

export function OperationsMeasurementsTab({ clientId }: OperationsMeasurementsTabProps) {
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useRole();
  const { hasAccess } = useFeatureAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<OperationDefault[]>([]);
  const [localDefaults, setLocalDefaults] = useState<LocalDefault[]>([]);

  const isAdmin = role === 'admin' || role === 'owner' || role === 'campaign_manager';

  useEffect(() => {
    loadDefaults();
  }, [clientId]);

  const loadDefaults = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('client_operation_defaults')
        .select('*')
        .eq('client_id', clientId)
        .order('operation_type')
        .order('operation_subtype');

      if (error) throw error;
      setDefaults(data || []);
    } catch (error: any) {
      console.error('Error loading operation defaults:', error);
      toast.error('Failed to load operation defaults');
    } finally {
      setLoading(false);
    }
  };

  // Build local defaults when data loads
  useEffect(() => {
    if (loading) return;

    const allDefaults: LocalDefault[] = [];

    const addDefaults = (operationType: string, typeOptions: typeof CHANGE_REQUEST_TYPES) => {
      typeOptions.forEach(option => {
        const existing = defaults.find(
          d => d.operation_type === operationType && d.operation_subtype === option.value
        );
        allDefaults.push({
          id: existing?.id,
          client_id: clientId,
          operation_type: operationType,
          operation_subtype: option.value,
          label: option.label,
          estimated_hours: existing?.estimated_hours ?? null,
          defaultHours: option.defaultHours,
          localValue: existing?.estimated_hours?.toString() ?? option.defaultHours.toString(),
          isDirty: false,
        });
      });
    };

    addDefaults('change_request', CHANGE_REQUEST_TYPES);
    addDefaults('submit_request', SUBMIT_REQUEST_TYPES);
    addDefaults('logged_action', LOGGED_ACTION_TYPES);

    setLocalDefaults(allDefaults);
  }, [defaults, clientId, loading]);

  const handleLocalChange = (operationType: string, operationSubtype: string, value: string) => {
    setLocalDefaults(prev => prev.map(d => 
      d.operation_type === operationType && d.operation_subtype === operationSubtype
        ? { ...d, localValue: value, isDirty: true }
        : d
    ));
  };

  const handleSave = async (item: LocalDefault) => {
    const hours = parseFloat(item.localValue);
    if (isNaN(hours) || hours < 0) {
      toast.error('Please enter a valid number');
      return;
    }

    const key = `${item.operation_type}-${item.operation_subtype}`;
    setSaving(key);

    try {
      if (item.id) {
        // Update existing
        const { error } = await supabase
          .from('client_operation_defaults')
          .update({ estimated_hours: hours })
          .eq('id', item.id);

        if (error) throw error;
        
        setDefaults(prev => prev.map(d => 
          d.id === item.id ? { ...d, estimated_hours: hours } : d
        ));
      } else {
        // Create new
        const { data, error } = await supabase
          .from('client_operation_defaults')
          .insert({
            client_id: clientId,
            operation_type: item.operation_type,
            operation_subtype: item.operation_subtype,
            estimated_hours: hours,
          })
          .select()
          .single();

        if (error) throw error;
        
        setDefaults(prev => [...prev, data]);
      }

      setLocalDefaults(prev => prev.map(d => 
        d.operation_type === item.operation_type && d.operation_subtype === item.operation_subtype
          ? { ...d, isDirty: false, estimated_hours: hours, id: item.id || defaults.find(def => def.operation_type === item.operation_type && def.operation_subtype === item.operation_subtype)?.id }
          : d
      ));

      toast.success('Hours saved');
    } catch (error: any) {
      console.error('Error saving hours:', error);
      toast.error('Failed to save hours');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAll = async () => {
    const dirtyItems = localDefaults.filter(d => d.isDirty);
    if (dirtyItems.length === 0) {
      toast.info('No changes to save');
      return;
    }

    setSaving('all');

    try {
      for (const item of dirtyItems) {
        const hours = parseFloat(item.localValue);
        if (isNaN(hours) || hours < 0) continue;

        if (item.id) {
          await supabase
            .from('client_operation_defaults')
            .update({ estimated_hours: hours })
            .eq('id', item.id);
        } else {
          const { data } = await supabase
            .from('client_operation_defaults')
            .insert({
              client_id: clientId,
              operation_type: item.operation_type,
              operation_subtype: item.operation_subtype,
              estimated_hours: hours,
            })
            .select()
            .single();

          if (data) {
            setDefaults(prev => [...prev, data]);
          }
        }
      }

      setLocalDefaults(prev => prev.map(d => ({ ...d, isDirty: false })));
      await loadDefaults();
      toast.success(`${dirtyItems.length} items saved`);
    } catch (error: any) {
      console.error('Error saving hours:', error);
      toast.error('Failed to save some items');
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteDefault = async (id: string) => {
    try {
      const { error } = await supabase
        .from('client_operation_defaults')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setDefaults(prev => prev.filter(d => d.id !== id));
      toast.success('Hours cleared');
    } catch (error: any) {
      console.error('Error deleting operation default:', error);
      toast.error('Failed to clear hours');
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const changeRequestDefaults = localDefaults.filter(d => d.operation_type === 'change_request');
  const submitRequestDefaults = localDefaults.filter(d => d.operation_type === 'submit_request');
  const loggedActionDefaults = localDefaults.filter(d => d.operation_type === 'logged_action');

  const hasUnsavedChanges = localDefaults.some(d => d.isDirty);

  const renderTable = (items: LocalDefault[], title: string) => (
    <div className="space-y-3">
      <h4 className="font-medium flex items-center gap-2">
        <Badge variant="outline">{title}</Badge>
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Estimated Hours</TableHead>
            {isAdmin && <TableHead className="w-[140px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => {
            const key = `${d.operation_type}-${d.operation_subtype}`;
            const isSaving = saving === key || saving === 'all';
            return (
              <TableRow key={d.operation_subtype}>
                <TableCell>{d.label}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      className="w-24"
                      placeholder={d.defaultHours.toString()}
                      value={d.localValue}
                      onChange={(e) => handleLocalChange(d.operation_type, d.operation_subtype, e.target.value)}
                      disabled={isSaving}
                    />
                  ) : (
                    <span>{d.estimated_hours !== null ? `${d.estimated_hours}h` : `${d.defaultHours}h`}</span>
                  )}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {d.isDirty && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSave(d)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 text-primary" />
                          )}
                        </Button>
                      )}
                      {d.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDefault(d.id!)}
                          disabled={isSaving}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Operations Time Estimates</CardTitle>
              <CardDescription>
                Define default time estimates for change requests, submit requests, and logged actions. 
                These estimates are used to calculate team workload and generate operations reports.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasAccess('operations_analytics') && (
                <Button 
                  variant="outline" 
                  onClick={() => navigate(`/app/operations-analytics?client=${clientId}`)}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Client Analytics
                </Button>
              )}
              {isAdmin && hasUnsavedChanges && (
                <Button onClick={handleSaveAll} disabled={saving === 'all'}>
                  {saving === 'all' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save All Changes
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderTable(changeRequestDefaults, 'Change Requests')}
          {renderTable(submitRequestDefaults, 'Submit Requests')}
          {renderTable(loggedActionDefaults, 'Logged Actions')}
        </CardContent>
      </Card>
    </div>
  );
}
