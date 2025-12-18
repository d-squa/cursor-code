import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
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
  { value: 'budget', label: 'Budget' },
  { value: 'duration', label: 'Duration' },
  { value: 'market', label: 'Market' },
  { value: 'targeting', label: 'Targeting' },
  { value: 'goals', label: 'Goals' },
  { value: 'creative', label: 'Creative' },
  { value: 'note', label: 'Note' },
  { value: 'other', label: 'Other' },
];

const LOGGED_ACTION_TYPES = [
  { value: 'Budget Adjustment', label: 'Budget Adjustment' },
  { value: 'Targeting Change', label: 'Targeting Change' },
  { value: 'Creative Update', label: 'Creative Update' },
  { value: 'Pause/Resume', label: 'Pause/Resume' },
  { value: 'Note', label: 'Note' },
];

export function OperationsMeasurementsTab({ clientId }: OperationsMeasurementsTabProps) {
  const { role, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState<OperationDefault[]>([]);
  const [newDefault, setNewDefault] = useState<Partial<OperationDefault>>({
    operation_type: 'change_request',
    operation_subtype: '',
    estimated_hours: 0.5,
  });

  const isAdmin = role === 'admin' || role === 'owner';

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

  const handleAddDefault = async () => {
    if (!newDefault.operation_subtype || !newDefault.estimated_hours) {
      toast.error('Please fill in all fields');
      return;
    }

    // Check for duplicates
    const exists = defaults.some(
      d => d.operation_type === newDefault.operation_type && 
           d.operation_subtype === newDefault.operation_subtype
    );

    if (exists) {
      toast.error('This operation type already exists');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('client_operation_defaults')
        .insert({
          client_id: clientId,
          operation_type: newDefault.operation_type,
          operation_subtype: newDefault.operation_subtype,
          estimated_hours: newDefault.estimated_hours,
        });

      if (error) throw error;

      toast.success('Operation default added');
      setNewDefault({
        operation_type: 'change_request',
        operation_subtype: '',
        estimated_hours: 0.5,
      });
      await loadDefaults();
    } catch (error: any) {
      console.error('Error adding operation default:', error);
      toast.error('Failed to add operation default');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateHours = async (id: string, hours: number) => {
    try {
      const { error } = await supabase
        .from('client_operation_defaults')
        .update({ estimated_hours: hours })
        .eq('id', id);

      if (error) throw error;
      
      setDefaults(prev => prev.map(d => 
        d.id === id ? { ...d, estimated_hours: hours } : d
      ));
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
      toast.success('Operation default removed');
    } catch (error: any) {
      console.error('Error deleting operation default:', error);
      toast.error('Failed to remove operation default');
    }
  };

  const getSubtypeOptions = () => {
    return newDefault.operation_type === 'change_request' 
      ? CHANGE_REQUEST_TYPES 
      : LOGGED_ACTION_TYPES;
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const changeRequestDefaults = defaults.filter(d => d.operation_type === 'change_request');
  const loggedActionDefaults = defaults.filter(d => d.operation_type === 'logged_action');

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
          {/* Add new default */}
          {isAdmin && (
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium">Add Time Estimate</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label>Operation Type</Label>
                  <Select
                    value={newDefault.operation_type}
                    onValueChange={(value) => setNewDefault({ 
                      ...newDefault, 
                      operation_type: value as 'change_request' | 'logged_action',
                      operation_subtype: '' 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="change_request">Change Request</SelectItem>
                      <SelectItem value="logged_action">Logged Action</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subtype</Label>
                  <Select
                    value={newDefault.operation_subtype}
                    onValueChange={(value) => setNewDefault({ ...newDefault, operation_subtype: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subtype..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getSubtypeOptions().map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estimated Hours</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={newDefault.estimated_hours}
                    onChange={(e) => setNewDefault({ ...newDefault, estimated_hours: parseFloat(e.target.value) || 0.5 })}
                    placeholder="e.g., 0.5"
                  />
                </div>
                <Button onClick={handleAddDefault} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Change Request Defaults */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Badge variant="outline">Change Requests</Badge>
            </h4>
            {changeRequestDefaults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No time estimates configured for change requests</p>
            ) : (
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
                    <TableRow key={d.id}>
                      <TableCell className="capitalize">{d.operation_subtype}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Input
                            type="number"
                            step="0.5"
                            min="0.5"
                            className="w-24"
                            value={d.estimated_hours}
                            onChange={(e) => handleUpdateHours(d.id!, parseFloat(e.target.value) || 0.5)}
                          />
                        ) : (
                          <span>{d.estimated_hours}h</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDefault(d.id!)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Logged Action Defaults */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Badge variant="outline">Logged Actions</Badge>
            </h4>
            {loggedActionDefaults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No time estimates configured for logged actions</p>
            ) : (
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
                    <TableRow key={d.id}>
                      <TableCell>{d.operation_subtype}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Input
                            type="number"
                            step="0.5"
                            min="0.5"
                            className="w-24"
                            value={d.estimated_hours}
                            onChange={(e) => handleUpdateHours(d.id!, parseFloat(e.target.value) || 0.5)}
                          />
                        ) : (
                          <span>{d.estimated_hours}h</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDefault(d.id!)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
