import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ClientForm from "@/components/ClientForm";

interface Client {
  id: string;
  name: string;
  website: string | null;
  app_name: string | null;
  industry: string;
  business_objective: string;
  created_at: string;
}

export default function Clients() {
  const { user, loading: authLoading } = useAuth();
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
    if (user) {
      loadClients();
    }
  }, [user]);

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (data: any) => {
    try {
      const { error } = await supabase.from("clients").insert({
        user_id: user?.id,
        ...data,
      });

      if (error) throw error;

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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
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
  );
}
