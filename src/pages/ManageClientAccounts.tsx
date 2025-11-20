import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AccountDefaultsTab from "@/components/AccountDefaultsTab";

interface Client {
  id: string;
  name: string;
  industry: string;
  business_objective: string;
  platforms: any; // Json type from Supabase
}

interface ConnectedPlatform {
  id: string;
  platform_type: string;
  platform_name: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  is_active: boolean;
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
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
  const [metaAdAccounts, setMetaAdAccounts] = useState<MetaAdAccount[]>([]);

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
      setClients(clientsData || []);

      // Set first client as selected if available
      if (clientsData && clientsData.length > 0 && !selectedClient) {
        setSelectedClient(clientsData[0].id);
      }

      // Load platforms
      const { data: platformsData, error: platformsError } = await supabase
        .from("connected_platforms_safe")
        .select("*");

      if (platformsError) throw platformsError;
      setPlatforms(platformsData || []);

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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedClientData = clients.find(c => c.id === selectedClient);
  const clientPlatforms = Array.isArray(selectedClientData?.platforms) 
    ? selectedClientData.platforms 
    : [];
  const clientAdAccounts = metaAdAccounts.filter(acc => acc.client_id === selectedClient);

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
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Client Details</TabsTrigger>
            <TabsTrigger value="accounts">Account Sync</TabsTrigger>
            <TabsTrigger value="defaults">Account Defaults</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Client Information</h3>
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
                  <p className="text-base">{clientPlatforms.join(", ")}</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Synced Ad Accounts</h3>
              {clientAdAccounts.length === 0 ? (
                <p className="text-muted-foreground">No ad accounts synced yet.</p>
              ) : (
                <div className="space-y-2">
                  {clientAdAccounts.map((account) => (
                    <div key={account.id} className="p-3 border rounded-md">
                      <p className="font-medium">{account.account_name}</p>
                      <p className="text-sm text-muted-foreground">ID: {account.account_id}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="defaults" className="space-y-4">
            {selectedClient && user ? (
              <AccountDefaultsTab clientId={selectedClient} userId={user.id} />
            ) : (
              <Card className="p-6">
                <p className="text-muted-foreground text-center">
                  Select a client to configure account defaults
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {!selectedClient && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Select a client to manage their accounts</p>
        </Card>
      )}
    </div>
  );
}
