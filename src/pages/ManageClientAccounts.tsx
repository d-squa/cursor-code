import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ClientForm from "@/components/ClientForm";
import AccountDefaultsTab from "@/components/AccountDefaultsTab";
import { FeatureGate } from "@/components/FeatureGate";

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);


  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .order("name");

      if (clientsError) throw clientsError;
      
      // Type cast platforms and markets from Json to string[]
      const typedClients = (clientsData || []).map(client => ({
        ...client,
        platforms: Array.isArray(client.platforms) ? client.platforms as string[] : [],
        markets: Array.isArray(client.markets) ? client.markets as string[] : [],
      }));
      
      setClients(typedClients);

      // Set first client as selected if available
      if (typedClients && typedClients.length > 0 && !selectedClient) {
        setSelectedClient(typedClients[0].id);
      }
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
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

      {/* Client Selector */}
      <Card className="p-4">
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
      </Card>

      {selectedClient && selectedClientData && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Client Info</TabsTrigger>
            <TabsTrigger value="defaults">Client Defaults</TabsTrigger>
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

          <TabsContent value="defaults" className="space-y-4">
            {selectedClient && user && (
              <AccountDefaultsTab 
                clientId={selectedClient} 
                userId={user.id}
                clientMarkets={clientMarkets}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      {!selectedClient && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Select a client to manage their accounts</p>
        </Card>
      )}

      {/* Edit Client Dialog */}
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
        </DialogContent>
      </Dialog>

    </div>
    </FeatureGate>
  );
}
