import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PlatformConfigFieldsProps {
  platformName: string;
  accountName?: string;
  accountId?: string;
  page?: string;
  pixel?: string;
  catalog?: string;
  onUpdate: (field: string, value: string) => void;
}

export function PlatformConfigFields({
  platformName,
  accountName,
  accountId,
  page,
  pixel,
  catalog,
  onUpdate,
}: PlatformConfigFieldsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Platform Configuration</CardTitle>
        <CardDescription className="text-sm">Configure {platformName} account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              value={accountName || ""}
              onChange={(e) => onUpdate("accountName", e.target.value)}
              placeholder="Enter account name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-id">Account ID</Label>
            <Input
              id="account-id"
              value={accountId || ""}
              onChange={(e) => onUpdate("accountId", e.target.value)}
              placeholder="Enter account ID"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="page">Page</Label>
          <Input
            id="page"
            value={page || ""}
            onChange={(e) => onUpdate("page", e.target.value)}
            placeholder="Enter page name or ID"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pixel">Pixel</Label>
            <Input
              id="pixel"
              value={pixel || ""}
              onChange={(e) => onUpdate("pixel", e.target.value)}
              placeholder="Enter pixel ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="catalog">Catalog</Label>
            <Input
              id="catalog"
              value={catalog || ""}
              onChange={(e) => onUpdate("catalog", e.target.value)}
              placeholder="Enter catalog ID"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
