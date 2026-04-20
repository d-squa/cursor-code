import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2, Facebook } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set(["meta"]));

  const togglePlatform = (platformId: string) => {
    const newExpanded = new Set(expandedPlatforms);
    if (newExpanded.has(platformId)) {
      newExpanded.delete(platformId);
    } else {
      newExpanded.add(platformId);
    }
    setExpandedPlatforms(newExpanded);
  };

  const handleLinkAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update({ client_id: clientId })
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account linked to client successfully");
      onRefresh();
    } catch (error: any) {
      console.error("Error linking account:", error);
      toast.error("Failed to link account");
    }
  };

  const handleUnsyncAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update({ client_id: null })
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account unlinked from client successfully");
      onRefresh();
    } catch (error: any) {
      console.error("Error unlinking account:", error);
      toast.error("Failed to unlink account");
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to permanently delete this ad account? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account deleted successfully");
      onRefresh();
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    }
  };

  const handleGoToPlatformConnections = () => {
    navigate("/app/settings/platforms");
  };

  return (
    <div className="space-y-6">
      {/* Add Account Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Platform Accounts</h3>
        <Button onClick={handleGoToPlatformConnections} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Connect More Accounts
        </Button>
      </div>

      {/* Platform Groups */}
      {PLATFORM_TYPES.map((platform) => {
        const linkedAccounts = platform.id === "meta" 
          ? metaAdAccounts.filter(acc => acc.client_id === clientId)
          : [];
        const availableAccounts = platform.id === "meta"
          ? metaAdAccounts.filter(acc => acc.client_id === null)
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
                    {linkedAccounts.length} linked • {availableAccounts.length} available
                  </p>
                </div>
              </div>
              <Badge variant="secondary">{linkedAccounts.length}</Badge>
            </div>

            {isExpanded && (
              <div className="border-t">
                {/* Linked Accounts Section */}
                {linkedAccounts.length > 0 && (
                  <div>
                    <div className="p-3 bg-muted/30 border-b">
                      <p className="text-sm font-medium">Linked to Client</p>
                    </div>
                    <div className="divide-y">
                      {linkedAccounts.map((account) => (
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
                              title="Unlink from client"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Accounts Section */}
                {availableAccounts.length > 0 && (
                  <div>
                    <div className="p-3 bg-muted/30 border-b">
                      <p className="text-sm font-medium">Available to Link</p>
                    </div>
                    <div className="divide-y">
                      {availableAccounts.map((account) => (
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
                              variant="default"
                              size="sm"
                              onClick={() => handleLinkAccount(account.id)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Link
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAccount(account.id)}
                              title="Delete account permanently"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Accounts Message */}
                {linkedAccounts.length === 0 && availableAccounts.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    <p className="mb-3">No ad accounts synced yet.</p>
                    <Button onClick={handleGoToPlatformConnections} variant="outline" size="sm">
                      Go to Platform Connections
                    </Button>
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
    </div>
  );
}
