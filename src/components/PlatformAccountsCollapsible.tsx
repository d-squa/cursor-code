import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";
import { ChevronDown, ChevronRight, Link2, Unlink, Trash2, RefreshCw, Loader2 } from "lucide-react";

interface MetaAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  account_status: string | null;
  client_id: string | null;
  clients?: {
    id: string;
    name: string;
  } | null;
}

interface TikTokAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  advertiser_id: string;
  account_status: string | null;
  client_id: string | null;
  bc_id?: string | null;
  business_center?: {
    bc_id: string;
    name: string;
    role?: string;
    status?: string;
  } | null;
  clients?: {
    id: string;
    name: string;
  } | null;
}

interface PlatformAccountsCollapsibleProps {
  platform: 'meta' | 'tiktok' | 'google';
  icon: React.ReactNode;
  title: string;
  accounts: MetaAdAccount[] | TikTokAdAccount[];
  emptyMessage: string;
  syncingAssets: string | null;
  canManageClients: boolean;
  onSyncAccount: (account: any, skipClientCheck?: boolean) => void;
  onLinkAccount: (accountId: string) => void;
  onUnlinkAccount: (accountId: string) => void;
  onDeleteAccount: (accountId: string) => void;
}

export default function PlatformAccountsCollapsible({
  platform,
  icon,
  title,
  accounts,
  emptyMessage,
  syncingAssets,
  canManageClients,
  onSyncAccount,
  onLinkAccount,
  onUnlinkAccount,
  onDeleteAccount,
}: PlatformAccountsCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(accounts.length > 0);

  const isTikTok = platform === 'tiktok';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            {icon}
            <span className="font-medium">{title}</span>
          </div>
          <Badge variant="secondary">{accounts.length}</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3 pl-4 space-y-2">
          {accounts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p>{emptyMessage}</p>
            </div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  isTikTok ? 'bg-black/5 dark:bg-white/5' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{account.account_name}</p>
                    {isTikTok && (account as TikTokAdAccount).bc_id && (account as TikTokAdAccount).business_center && (
                      <Badge variant="outline" className="text-xs">
                        BC: {(account as TikTokAdAccount).business_center?.name}
                      </Badge>
                    )}
                    <Badge 
                      variant="outline" 
                      className={isTikTok ? "border-black/20 dark:border-white/20" : ""}
                    >
                      {account.account_id}
                    </Badge>
                    {account.client_id && account.clients && (
                      <Badge variant="secondary">
                        <Link2 className="h-3 w-3 mr-1" />
                        {account.clients.name}
                      </Badge>
                    )}
                  </div>
                  {account.account_status && (
                    <p className="text-sm text-muted-foreground">Status: {account.account_status}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSyncAccount(account);
                          }}
                          disabled={syncingAssets === account.id}
                          className={isTikTok ? "border-black/20 dark:border-white/20" : ""}
                        >
                          {syncingAssets === account.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isTikTok ? "Sync pixels, identities & benchmarks" : "Sync pixels, pages, catalogs for this account"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {canManageClients ? (
                    account.client_id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnlinkAccount(account.id);
                        }}
                        className={isTikTok ? "border-black/20 dark:border-white/20" : ""}
                      >
                        <Unlink className="h-4 w-4 mr-2" />
                        Unlink
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLinkAccount(account.id);
                        }}
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        Link to Client
                      </Button>
                    )
                  ) : (
                    <LockedFeatureButton feature="client_management">
                      <Button variant="default" size="sm">
                        <Link2 className="h-4 w-4 mr-2" />
                        Link to Client
                      </Button>
                    </LockedFeatureButton>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAccount(account.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
