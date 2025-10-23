import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Facebook, Linkedin } from "lucide-react";

interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
}

interface PlatformSelectorProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
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

export function PlatformSelector({ platforms, setPlatforms }: PlatformSelectorProps) {
  const togglePlatform = (platformId: string) => {
    setPlatforms(
      platforms.map((p) =>
        p.id === platformId ? { ...p, enabled: !p.enabled } : p
      )
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Platforms</CardTitle>
        <CardDescription>Choose which ad platforms to include in your campaign</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
      </CardContent>
    </Card>
  );
}
