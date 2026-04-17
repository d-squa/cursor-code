import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ClientForm from "@/components/ClientForm";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { FeatureGate } from "@/components/FeatureGate";

interface Client {
  id: string;
  name: string;
  website: string | null;
  app_name: string | null;
  industry: string;
  business_objective: string;
  platforms: string[];
  markets: string[];
  created_at: string;
}

export default function Clients() {
  const { user, loading: authLoading } = useAuth();
  const { canManageClients, loading: roleLoading } = useRole();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { isSampleMode } = useSampleMode();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && activeWorkspaceId) {
      loadClients();
    }
  }, [user, activeWorkspaceId, isSampleMode]);

  const loadClients = async () => {
    if (!activeWorkspaceId) {
      setClients([]);
      setLoading(false);
      return;
    }
    
    try {
      // Fetch clients linked to the active workspace via team_clients
      const { data: teamClients, error: tcError } = await supabase
        .from("team_clients")
        .select("client_id, clients(*)")
        .eq("team_id", activeWorkspaceId);

      if (tcError) throw tcError;
      
      // Extract and type cast clients from the join
      let typedClients = (teamClients || [])
        .map(tc => tc.clients)
        .filter(Boolean)
        .map((client: any) => ({
          ...client,
          platforms: Array.isArray(client.platforms) ? client.platforms as string[] : [],
          markets: Array.isArray(client.markets) ? client.markets as string[] : [],
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      // Sample mode: only show D-squad. Real mode: hide D-squad.
      typedClients = isSampleMode
        ? typedClients.filter((c: any) => c.name === "D-squad")
        : typedClients.filter((c: any) => c.name !== "D-squad");
      
      setClients(typedClients);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (data: any) => {
    if (!activeWorkspaceId) {
      toast.error("No workspace selected");
      return;
    }
    
    try {
      // Insert the client
      const { data: newClient, error } = await supabase.from("clients").insert({
        user_id: user?.id,
        ...data,
      }).select().single();

      if (error) throw error;

      // Link the client to the current workspace
      const { error: linkError } = await supabase.from("team_clients").insert({
        team_id: activeWorkspaceId,
        client_id: newClient.id,
      });

      if (linkError) {
        console.error("Error linking client to workspace:", linkError);
        // Don't fail the whole operation, client was created
      }

      toast.success("Client created successfully");
      setDialogOpen(false);
      loadClients();
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast.error("Failed to create client");
      throw error;
    }
  };

  const handleUpdateClient = async (data: any) => {
    if (!editingClient) return;

    try {
      const { error } = await supabase
        .from("clients")
        .update(data)
        .eq("id", editingClient.id);

      if (error) throw error;

      toast.success("Client updated successfully");
      setDialogOpen(false);
      setEditingClient(null);
      loadClients();
    } catch (error: any) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client");
      throw error;
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientToDelete.id);

      if (error) throw error;

      toast.success("Client deleted successfully");
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      loadClients();
    } catch (error: any) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    } finally {
      setDeleting(false);
    }
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingClient(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
  };

  if (authLoading || loading || roleLoading || workspaceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManageClients) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to manage clients. Only administrators can access this section.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <FeatureGate feature="client_management">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Client Portfolio</h1>
            <p className="text-muted-foreground mt-1">
              Manage your client information and onboarding
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            New Client
          </Button>
        </div>

        {clients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No clients yet</p>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <Card key={client.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{client.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {client.industry}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(client)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setClientToDelete(client);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Objective:</span>{" "}
                    <span className="text-muted-foreground">{client.business_objective}</span>
                  </div>
                  {client.website && (
                    <div>
                      <span className="font-medium">Website:</span>{" "}
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {client.website}
                      </a>
                    </div>
                  )}
                  {client.app_name && (
                    <div>
                      <span className="font-medium">App:</span>{" "}
                      <span className="text-muted-foreground">{client.app_name}</span>
                    </div>
                  )}
                  {client.platforms && client.platforms.length > 0 && (
                    <div>
                      <span className="font-medium">Platforms:</span>{" "}
                      <span className="text-muted-foreground">{client.platforms.join(", ")}</span>
                    </div>
                  )}
                  {client.markets && client.markets.length > 0 && (
                    <div>
                      <span className="font-medium">Markets:</span>{" "}
                      <span className="text-muted-foreground">{client.markets.join(", ")}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={closeDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingClient ? "Edit Client" : "New Client"}</DialogTitle>
              <DialogDescription>
                {editingClient
                  ? "Update client information"
                  : "Add a new client to your portfolio"}
              </DialogDescription>
            </DialogHeader>
            <ClientForm
              initialData={editingClient || undefined}
              onSubmit={editingClient ? handleUpdateClient : handleCreateClient}
              onCancel={closeDialog}
              submitLabel={editingClient ? "Update Client" : "Create Client"}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Client</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {clientToDelete?.name}? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteClient} disabled={deleting}>
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </FeatureGate>
  );
}
