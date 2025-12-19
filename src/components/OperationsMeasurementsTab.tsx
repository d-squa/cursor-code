import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { useRole } from "@/hooks/useRole";

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
  { value: 'budget_increase', label: 'Budget Increase' },
  { value: 'budget_decrease', label: 'Budget Decrease' },
  { value: 'duration_extension', label: 'Duration Extension' },
  { value: 'market_expansion', label: 'Market Expansion' },
  { value: 'targeting_change', label: 'Targeting Change' },
  { value: 'goals_update', label: 'Goals/KPI Update' },
  { value: 'creative_change', label: 'Creative Change' },
  { value: 'pause_request', label: 'Pause Request' },
  { value: 'other', label: 'Other' },
];

const SUBMIT_REQUEST_TYPES = [
  { value: 'budget_change', label: 'Budget Change' },
  { value: 'creative_optimization', label: 'Creative Optimization' },
  { value: 'pause_enable_campaigns', label: 'Pause/Enable Campaigns' },
  { value: 'targeting_optimization', label: 'Targeting Optimization' },
  { value: 'audience_expansion', label: 'Audience Expansion' },
  { value: 'bid_adjustment', label: 'Bid Adjustment' },
  { value: 'schedule_change', label: 'Schedule Change' },
  { value: 'landing_page_update', label: 'Landing Page Update' },
  { value: 'ad_copy_update', label: 'Ad Copy Update' },
  { value: 'placement_change', label: 'Placement Change' },
  { value: 'conversion_tracking', label: 'Conversion Tracking Setup' },
  { value: 'pixel_implementation', label: 'Pixel Implementation' },
  { value: 'reporting_request', label: 'Reporting Request' },
  { value: 'other', label: 'Other' },
];

const LOGGED_ACTION_TYPES = [
  { value: 'budget_adjustment', label: 'Budget Adjustment' },
  { value: 'targeting_change', label: 'Targeting Change' },
  { value: 'creative_update', label: 'Creative Update' },
  { value: 'campaign_pause_resume', label: 'Campaign Pause/Resume' },
  { value: 'audience_update', label: 'Audience Update' },
  { value: 'bid_change', label: 'Bid Change' },
  { value: 'schedule_modification', label: 'Schedule Modification' },
  { value: 'landing_page_change', label: 'Landing Page Change' },
  { value: 'ad_copy_change', label: 'Ad Copy Change' },
  { value: 'placement_update', label: 'Placement Update' },
  { value: 'conversion_setup', label: 'Conversion Setup' },
  { value: 'reporting_delivery', label: 'Reporting Delivery' },
  { value: 'note', label: 'Note/Comment' },
];

export function OperationsMeasurementsTab({ clientId }: OperationsMeasurementsTabProps) {
  const { role, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [defaults, setDefaults] = useState<OperationDefault[]>([]);

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

  const handleUpdateHours = async (item: { id?: string; operation_type: string; operation_subtype: string }, hours: number) => {
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
      toast.success('Hours updated');
    } catch (error: any) {
      console.error('Error updating hours:', error);
      toast.error('Failed to update hours');
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

  // Merge saved defaults with all available types
  const getMergedDefaults = (operationType: string, typeOptions: typeof CHANGE_REQUEST_TYPES) => {
    return typeOptions.map(option => {
      const existing = defaults.find(
        d => d.operation_type === operationType && d.operation_subtype === option.value
      );
      return {
        id: existing?.id,
        client_id: clientId,
        operation_type: operationType,
        operation_subtype: option.value,
        label: option.label,
        estimated_hours: existing?.estimated_hours ?? null,
      };
    });
  };

  const changeRequestDefaults = getMergedDefaults('change_request', CHANGE_REQUEST_TYPES);
  const submitRequestDefaults = getMergedDefaults('submit_request', SUBMIT_REQUEST_TYPES);
  const loggedActionDefaults = getMergedDefaults('logged_action', LOGGED_ACTION_TYPES);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Operations Time Estimates</CardTitle>
          <CardDescription>
            Define default time estimates for change requests and logged actions. 
            These estimates are used to calculate team workload and generate operations reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Change Request Defaults */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Badge variant="outline">Change Requests</Badge>
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Estimated Hours</TableHead>
                  {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {changeRequestDefaults.map((d) => (
                  <TableRow key={d.operation_subtype}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          className="w-24"
                          placeholder="—"
                          value={d.estimated_hours ?? ''}
                          onChange={(e) => handleUpdateHours(
                            { id: d.id, operation_type: d.operation_type, operation_subtype: d.operation_subtype },
                            parseFloat(e.target.value) || 0
                          )}
                        />
                      ) : (
                        <span>{d.estimated_hours !== null ? `${d.estimated_hours}h` : '—'}</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {d.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDefault(d.id!)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Submit Request Defaults */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Badge variant="outline">Submit Requests</Badge>
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Estimated Hours</TableHead>
                  {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {submitRequestDefaults.map((d) => (
                  <TableRow key={d.operation_subtype}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          className="w-24"
                          placeholder="—"
                          value={d.estimated_hours ?? ''}
                          onChange={(e) => handleUpdateHours(
                            { id: d.id, operation_type: d.operation_type, operation_subtype: d.operation_subtype },
                            parseFloat(e.target.value) || 0
                          )}
                        />
                      ) : (
                        <span>{d.estimated_hours !== null ? `${d.estimated_hours}h` : '—'}</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {d.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDefault(d.id!)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Logged Action Defaults */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Badge variant="outline">Logged Actions</Badge>
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Estimated Hours</TableHead>
                  {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loggedActionDefaults.map((d) => (
                  <TableRow key={d.operation_subtype}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          className="w-24"
                          placeholder="—"
                          value={d.estimated_hours ?? ''}
                          onChange={(e) => handleUpdateHours(
                            { id: d.id, operation_type: d.operation_type, operation_subtype: d.operation_subtype },
                            parseFloat(e.target.value) || 0
                          )}
                        />
                      ) : (
                        <span>{d.estimated_hours !== null ? `${d.estimated_hours}h` : '—'}</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {d.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDefault(d.id!)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
