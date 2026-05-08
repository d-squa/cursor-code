import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ClientForm from "@/components/ClientForm";
import AccountDefaultsTab from "@/components/AccountDefaultsTab";
import { OperationsMeasurementsTab } from "@/components/OperationsMeasurementsTab";
import { ClientQCChecklistEditor } from "@/components/settings/ClientQCChecklistEditor";
import { ClientBrandingTab } from "@/components/ClientBrandingTab";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSampleMode } from "@/contexts/SampleModeContext";
interface Client {
  id: string;
  name: string;
  industry: string;
  business_objective: string;
  platforms: string[];
  markets: string[];
  website?: string;
  app_name?: string;
}

export default function ManageClientAccounts() {
  const { user, loading: authLoading } = useAuth();
  const { hasAccess } = useFeatureAccess();
  const { isSampleMode } = useSampleMode();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  const canAccessOperations = hasAccess('operations_measurements');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, isSampleMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .order("name");

      if (clientsError) throw clientsError;
      
      let typedClients = (clientsData || []).map(client => ({
        ...client,
        platforms: Array.isArray(client.platforms) ? client.platforms as string[] : [],
        markets: Array.isArray(client.markets) ? client.markets as string[] : [],
      }));

      typedClients = isSampleMode
        ? typedClients.filter((client) => client.name === "D-squad")
        : typedClients.filter((client) => client.name !== "D-squad");
      
      setClients(typedClients);

      if (typedClients.length === 0) {
        setSelectedClient(null);
      } else if (!selectedClient || !typedClients.some((client) => client.id === selectedClient)) {
        setSelectedClient(typedClients[0].id);
      }
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (data: any) => {
    if (!user) return;

    try {
      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          ...data,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Client created successfully");
      setCreateDialogOpen(false);
      await loadData();
      if (newClient) {
        setSelectedClient(newClient.id);
      }
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast.error("Failed to create client");
      throw error;
    }
  };

  const handleUpdateClient = async (data: any) => {
    if (!selectedClient) return;

    try {
      const { error } = await supabase
        .from("clients")
        .update(data)
        .eq("id", selectedClient);

      if (error) throw error;

      toast.success("Client updated successfully");
      setEditDialogOpen(false);
      await loadData();
    } catch (error: any) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client");
      throw error;
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", selectedClient);

      if (error) throw error;

      toast.success("Client deleted successfully");
      setDeleteDialogOpen(false);
      setEditDialogOpen(false);
      await loadData();
    } catch (error: any) {
      console.error("Error deleting client:", error);
      toast.error(error?.message || "Failed to delete client");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedClientData = clients.find(c => c.id === selectedClient);
  const clientPlatforms = selectedClientData?.platforms || [];
  const clientMarkets = selectedClientData?.markets || [];

  return (
    <FeatureGate feature="client_management">
      <div className="container mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Client Management</h1>
          <p className="text-muted-foreground mt-2">
            View and edit client information and configure default settings
          </p>
        </div>

        <Card className="p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Select Client</label>
              <select
                value={selectedClient || ""}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full p-2 border rounded-md bg-background"
              >
                <option value="">Select a client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Client
            </Button>
          </div>
        </Card>

        {selectedClient && selectedClientData && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn("grid w-full", canAccessOperations ? "grid-cols-5" : "grid-cols-4")}>
              <TabsTrigger value="info">Client Info</TabsTrigger>
              <TabsTrigger value="branding">Branding</TabsTrigger>
              <TabsTrigger value="defaults">Client Defaults</TabsTrigger>
              <TabsTrigger value="qc_checklists">QC Checklists</TabsTrigger>
              {canAccessOperations && (
                <TabsTrigger value="operations">Operations</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Client Information</h3>
                  <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Client
                  </Button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Name</label>
                    <p className="text-base">{selectedClientData.name}</p>
                  </div>
                  {selectedClientData.website && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Website</label>
                      <p className="text-base">{selectedClientData.website}</p>
                    </div>
                  )}
                  {selectedClientData.app_name && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">App Name</label>
                      <p className="text-base">{selectedClientData.app_name}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Industry</label>
                    <p className="text-base">{selectedClientData.industry}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Business Objective</label>
                    <p className="text-base">{selectedClientData.business_objective}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Platforms</label>
                    <p className="text-base">{clientPlatforms.length > 0 ? clientPlatforms.join(", ") : "Not set"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Markets</label>
                    <p className="text-base">{clientMarkets.length > 0 ? clientMarkets.join(", ") : "Not set"}</p>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="branding" className="space-y-4">
              {selectedClient && (
                <ClientBrandingTab
                  clientId={selectedClient}
                  initialData={selectedClientData as any}
                  onUpdate={() => loadData()}
                />
              )}
            </TabsContent>

            <TabsContent value="defaults" className="space-y-4">
              {selectedClient && user && (
                <AccountDefaultsTab 
                  clientId={selectedClient} 
                  userId={user.id}
                  clientMarkets={clientMarkets}
                />
              )}
            </TabsContent>

            <TabsContent value="qc_checklists" className="space-y-4">
              {selectedClient && (
                <ClientQCChecklistEditor clientId={selectedClient} />
              )}
            </TabsContent>

            {canAccessOperations && (
              <TabsContent value="operations" className="space-y-4">
                {selectedClient && (
                  <OperationsMeasurementsTab clientId={selectedClient} />
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        {!selectedClient && (
          <Card className="p-8 text-center space-y-4">
            <p className="text-muted-foreground">Select a client to manage their accounts or create a new one</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Client
            </Button>
          </Card>
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Client</DialogTitle>
              <DialogDescription>
                Update client information
              </DialogDescription>
            </DialogHeader>
            <ClientForm
              initialData={selectedClientData}
              onSubmit={handleUpdateClient}
              onCancel={() => setEditDialogOpen(false)}
              submitLabel="Update Client"
            />
            <div className="border-t pt-4 mt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete client
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete client</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedClientData?.name ?? "this client"}? This cannot be
                undone. Related workspace links and data tied to this client may be removed or become invalid.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteClient}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Client</DialogTitle>
              <DialogDescription>
                Add a new client to manage
              </DialogDescription>
            </DialogHeader>
            <ClientForm
              onSubmit={handleCreateClient}
              onCancel={() => setCreateDialogOpen(false)}
              submitLabel="Create Client"
            />
          </DialogContent>
        </Dialog>
      </div>
    </FeatureGate>
  );
}
