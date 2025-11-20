import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2, Facebook, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLATFORM_CONFIG } from "@/config/platforms";
import AccountDefaultsTab from "@/components/AccountDefaultsTab";

interface MetaAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  client_id: string | null;
  currency?: string | null;
  account_status?: string | null;
}

interface ClientPlatformAccountsProps {
  clientId: string;
  userId: string;
  metaAdAccounts: MetaAdAccount[];
  onRefresh: () => void;
}

const PLATFORM_TYPES = [
  { id: "meta", name: "Meta (Facebook & Instagram)", icon: Facebook, color: "bg-blue-600" },
];

export default function ClientPlatformAccounts({ 
  clientId, 
  userId,
  metaAdAccounts, 
  onRefresh 
}: ClientPlatformAccountsProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set(["meta"]));
  const [addAccountDialogOpen, setAddAccountDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const processingOAuthRef = useRef(false);

  const togglePlatform = (platformId: string) => {
    const newExpanded = new Set(expandedPlatforms);
    if (newExpanded.has(platformId)) {
      newExpanded.delete(platformId);
    } else {
      newExpanded.add(platformId);
    }
    setExpandedPlatforms(newExpanded);
  };

  const handleUnsyncAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update({ client_id: null })
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account unsynced successfully");
      onRefresh();
    } catch (error: any) {
      console.error("Error unsyncing account:", error);
      toast.error("Failed to unsync account");
    }
  };

  const handleAddAccount = async () => {
    if (!selectedPlatform) {
      toast.error("Please select a platform");
      return;
    }

    if (selectedPlatform === "meta") {
      handleConnectMeta();
    } else {
      toast.error("This platform is not yet supported");
    }
  };

  const handleConnectMeta = async () => {
    if (processingOAuthRef.current) {
      console.log("OAuth already in progress, skipping...");
      return;
    }

    try {
      processingOAuthRef.current = true;
      setSyncing(true);

      const redirectUri = `${window.location.origin}/manage-accounts`;
      const clientId = PLATFORM_CONFIG.meta.appId;

      console.log("=== Meta OAuth Flow Starting ===");
      console.log("Redirect URI:", redirectUri);
      console.log("Client ID:", clientId);

      if (!clientId) {
        toast.error("Meta App ID not configured. Please contact support.");
        return;
      }

      const state = JSON.stringify({ 
        clientId,
        returnUrl: redirectUri 
      });

      console.log("State object:", state);

      const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}` +
        `&scope=ads_management,ads_read,business_management,pages_read_engagement,instagram_basic`;

      console.log("Redirecting to:", authUrl);
      window.location.href = authUrl;
    } catch (error: any) {
      console.error("Error connecting to Meta:", error);
      toast.error("Failed to start Meta authentication");
      processingOAuthRef.current = false;
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Account Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Platform Accounts</h3>
        <Button onClick={() => setAddAccountDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Account
        </Button>
      </div>

      {/* Platform Groups */}
      {PLATFORM_TYPES.map((platform) => {
        const platformAccounts = platform.id === "meta" 
          ? metaAdAccounts.filter(acc => acc.client_id === clientId)
          : [];
        const isExpanded = expandedPlatforms.has(platform.id);
        const Icon = platform.icon;

        return (
          <Card key={platform.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => togglePlatform(platform.id)}
            >
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                {Icon && <Icon className="h-5 w-5" />}
                <div>
                  <p className="font-medium">{platform.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {platformAccounts.length} account{platformAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">{platformAccounts.length}</Badge>
            </div>

            {isExpanded && (
              <div className="border-t">
                {platformAccounts.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No ad accounts synced for this platform yet.
                  </div>
                ) : (
                  <div className="divide-y">
                    {platformAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{account.account_name}</p>
                          <p className="text-sm text-muted-foreground">
                            ID: {account.account_id}
                          </p>
                          {account.currency && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Currency: {account.currency}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {account.account_status && (
                            <Badge variant={account.account_status === "ACTIVE" ? "default" : "secondary"}>
                              {account.account_status}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnsyncAccount(account.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Account Defaults Section */}
      <div className="pt-6 border-t">
        <h3 className="text-lg font-semibold mb-4">Account Defaults</h3>
        <AccountDefaultsTab clientId={clientId} userId={userId} />
      </div>

      {/* Add Account Dialog */}
      <Dialog open={addAccountDialogOpen} onOpenChange={setAddAccountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Platform Account</DialogTitle>
            <DialogDescription>
              Select a platform to authenticate and sync ad accounts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Platform</label>
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a platform..." />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_TYPES.map((platform) => (
                    <SelectItem key={platform.id} value={platform.id}>
                      {platform.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAddAccount}
              disabled={!selectedPlatform || syncing}
              className="w-full"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Authenticate & Sync
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
