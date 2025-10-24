import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface Market {
  id: string;
  name: string;
  budgetPercentage: number;
}

export interface PlatformWithMarkets {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
  markets: Market[];
}

interface PlatformMarketSelectorProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: (platforms: PlatformWithMarkets[]) => void;
}

const platformIcons: Record<string, string> = {
  meta: "🔵",
  google: "🔴",
  linkedin: "💼",
  tiktok: "⚫",
  snapchat: "👻",
  pinterest: "📌",
};

const platformColors: Record<string, string> = {
  meta: "from-blue-500 to-blue-600",
  google: "from-red-500 to-orange-500",
  linkedin: "from-blue-600 to-blue-700",
  tiktok: "from-black to-gray-800",
  snapchat: "from-yellow-300 to-yellow-400",
  pinterest: "from-red-600 to-red-700",
};

export function PlatformMarketSelector({ platforms, setPlatforms }: PlatformMarketSelectorProps) {
  const togglePlatform = (platformId: string) => {
    setPlatforms(
      platforms.map((p) =>
        p.id === platformId ? { ...p, enabled: !p.enabled } : p
      )
    );
  };

  const addMarket = (platformId: string) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId) {
          const newMarket: Market = {
            id: `market-${Date.now()}`,
            name: "",
            budgetPercentage: 0,
          };
          return { ...p, markets: [...p.markets, newMarket] };
        }
        return p;
      })
    );
  };

  const removeMarket = (platformId: string, marketId: string) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId) {
          return { ...p, markets: p.markets.filter((m) => m.id !== marketId) };
        }
        return p;
      })
    );
  };

  const updateMarket = (platformId: string, marketId: string, field: keyof Market, value: any) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map((m) =>
              m.id === marketId ? { ...m, [field]: value } : m
            ),
          };
        }
        return p;
      })
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platforms & Markets</CardTitle>
        <CardDescription>Select platforms and define markets for your activation</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              className={`
                relative overflow-hidden rounded-lg border-2 transition-all duration-200
                ${
                  platform.enabled
                    ? "border-primary shadow-md bg-gradient-to-br " + platformColors[platform.id]
                    : "border-border bg-card hover:border-muted-foreground"
                }
              `}
            >
              <label
                htmlFor={platform.id}
                className={`
                  flex flex-col items-center justify-center p-4 cursor-pointer
                  ${platform.enabled ? "text-white" : "text-foreground"}
                `}
              >
                <div className="text-4xl mb-2">{platformIcons[platform.id]}</div>
                <div className="text-sm font-medium text-center">{platform.name}</div>
                <Checkbox
                  id={platform.id}
                  checked={platform.enabled}
                  onCheckedChange={() => togglePlatform(platform.id)}
                  className="absolute top-2 right-2 bg-white border-white data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </label>
            </div>
          ))}
        </div>

        {/* Market Configuration for Enabled Platforms */}
        {platforms.filter(p => p.enabled).length > 0 && (
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Market Configuration</h4>
            {platforms.filter(p => p.enabled).map((platform) => (
              <div key={platform.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">{platform.name} Markets</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addMarket(platform.id)}
                  >
                    Add Market
                  </Button>
                </div>
                {platform.markets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No markets defined yet. Add a market to continue.</p>
                ) : (
                  <div className="space-y-2">
                    {platform.markets.map((market) => (
                      <div key={market.id} className="flex items-center gap-2">
                        <Input
                          placeholder="Market name (e.g., United States)"
                          value={market.name}
                          onChange={(e) => updateMarket(platform.id, market.id, "name", e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMarket(platform.id, market.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
