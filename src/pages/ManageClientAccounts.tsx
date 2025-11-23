import { useState, useEffect, useRef } from "react";
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
import ClientPlatformAccounts from "@/components/ClientPlatformAccounts";

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


interface MetaAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  client_id: string | null;
}

export default function ManageClientAccounts() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [metaAdAccounts, setMetaAdAccounts] = useState<MetaAdAccount[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const processingOAuthRef = useRef(false);

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

  // Check for tab query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get("tab");
    if (tab === "accounts") {
      setActiveTab("accounts");
    }
  }, []);

  // Handle OAuth callback from Meta
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");

      if (code && state && !processingOAuthRef.current && user) {
        processingOAuthRef.current = true;
        
        // Clear URL immediately to prevent reuse
        window.history.replaceState({}, document.title, window.location.pathname);

        try {
          const stateData = JSON.parse(state);
          const redirectUri = stateData.returnUrl || `${window.location.origin}/settings/accounts`;

          console.log("Processing OAuth callback with code:", code.substring(0, 10) + "...");

          const { data, error } = await supabase.functions.invoke("meta-oauth-callback", {
            body: {
              code,
              platformType: "meta",
              redirectUri,
            },
          });

          if (error) throw error;

          if (data?.error) {
            throw new Error(data.error);
          }

          toast.success("Successfully connected to Meta! Syncing ad accounts...");
          
          // Wait for database commit to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Call the sync endpoint to sync ad accounts
          const { error: syncError } = await supabase.functions.invoke("sync-meta-resources");

          if (syncError) {
            console.error("Sync error:", syncError);
            // Retry once after a longer delay
            console.log("Retrying sync after delay...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            const { error: retryError } = await supabase.functions.invoke("sync-meta-resources");
            
            if (retryError) {
              console.error("Retry sync error:", retryError);
              toast.error("Connected but failed to sync ad accounts. Please try syncing manually.");
            } else {
              toast.success("Ad accounts synced successfully!");
            }
          } else {
            toast.success("Ad accounts synced successfully!");
          }

          // Refresh data and switch to accounts tab
          await loadData();
          setActiveTab("accounts");
          
          // Update URL to show accounts tab without reloading
          window.history.replaceState({}, document.title, "/settings/accounts?tab=accounts");
        } catch (error: any) {
          console.error("OAuth callback error:", error);
          toast.error(error.message || "Failed to complete authentication");
        } finally {
          processingOAuthRef.current = false;
        }
      }
    };

    if (user) {
      handleOAuthCallback();
    }
  }, [user, selectedClient]);

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

      // Load meta ad accounts
      const { data: metaData, error: metaError } = await supabase
        .from("meta_ad_accounts")
        .select("id, account_id, account_name, client_id");

      if (metaError) throw metaError;
      setMetaAdAccounts(metaData || []);
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
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manage Client Accounts</h1>
        <p className="text-muted-foreground mt-2">
          Manage client details, sync ad accounts, and configure defaults
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
            <TabsTrigger value="details">Client Details</TabsTrigger>
            <TabsTrigger value="accounts">Account Sync</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
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

          <TabsContent value="accounts" className="space-y-4">
            {selectedClient && user && (
              <ClientPlatformAccounts
                clientId={selectedClient}
                userId={user.id}
                metaAdAccounts={metaAdAccounts}
                onRefresh={loadData}
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
  );
}
