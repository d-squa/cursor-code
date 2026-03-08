import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, X, Plus, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface KeywordItem {
  id: string;
  name: string;
  platform: "google" | "tiktok";
  avgMonthlySearches?: number;
  competition?: string;
  cpcLow?: number;
  cpcHigh?: number;
}

interface KeywordTargetingProps {
  selectedKeywords: KeywordItem[];
  onUpdate: (keywords: KeywordItem[]) => void;
  googleCustomerId?: string;
  tiktokAdvertiserId?: string;
}

export function KeywordTargeting({
  selectedKeywords,
  onUpdate,
  googleCustomerId,
  tiktokAdvertiserId,
}: KeywordTargetingProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<KeywordItem[]>([]);

  const hasGoogleOrTiktok = !!googleCustomerId || !!tiktokAdvertiserId;

  if (!hasGoogleOrTiktok) return null;

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.error("Please enter a keyword to search");
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-platform-keywords", {
        body: { query, googleCustomerId, tiktokAdvertiserId },
      });

      if (error) throw error;

      setResults(data.results || []);
      if (data.results?.length > 0) {
        toast.success(`Found ${data.results.length} keyword suggestions`);
      } else {
        toast.warning("No keyword suggestions found");
      }
    } catch (error: any) {
      console.error("Keyword search error:", error);
      toast.error(error.message || "Failed to search keywords");
    } finally {
      setSearching(false);
    }
  };

  const isSelected = (kw: KeywordItem) =>
    selectedKeywords.some((s) => s.id === kw.id);

  const handleAdd = (kw: KeywordItem) => {
    if (isSelected(kw)) {
      toast.info("Already selected");
      return;
    }
    onUpdate([...selectedKeywords, kw]);
  };

  const handleRemove = (kw: KeywordItem) => {
    onUpdate(selectedKeywords.filter((s) => s.id !== kw.id));
  };

  const totalSearchVolume = selectedKeywords.reduce((sum, kw) => sum + (kw.avgMonthlySearches || 0), 0);
  const avgSearchVolume = selectedKeywords.length > 0 ? Math.round(totalSearchVolume / selectedKeywords.length) : 0;

  const formatSearchVolume = (vol?: number) => {
    if (!vol) return "N/A";
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
    return String(vol);
  };

  const getPlatformColor = (platform: string) => {
    return platform === "google" ? "border-green-200" : "border-pink-200";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Keyword Targeting
          <Badge variant="secondary" className="ml-auto text-xs">
            {googleCustomerId ? "Google Ads" : ""}{googleCustomerId && tiktokAdvertiserId ? " + " : ""}{tiktokAdvertiserId ? "TikTok" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search keywords (e.g. running shoes, fitness app)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Suggestions ({results.length})
            </p>
            <ScrollArea className="h-[280px]">
              <div className="space-y-2">
                {results.map((kw) => (
                  <div
                    key={kw.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isSelected(kw)
                        ? "bg-accent/50 border-accent"
                        : "bg-card hover:bg-muted/50 border-border"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{kw.name}</span>
                        <Badge variant="outline" className={`text-xs ${getPlatformColor(kw.platform)}`}>
                          {kw.platform === "google" ? "Google" : "TikTok"}
                        </Badge>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Vol: {formatSearchVolume(kw.avgMonthlySearches)}</span>
                        {kw.competition && <span>Comp: {kw.competition}</span>}
                        {kw.cpcHigh ? <span>CPC: ${kw.cpcLow?.toFixed(2)}-${kw.cpcHigh?.toFixed(2)}</span> : null}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isSelected(kw) ? "secondary" : "outline"}
                      onClick={() => (isSelected(kw) ? handleRemove(kw) : handleAdd(kw))}
                      className="ml-2 shrink-0"
                    >
                      {isSelected(kw) ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Selected Keywords */}
        {selectedKeywords.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Selected Keywords ({selectedKeywords.length})
              </p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>
                  Total Vol: <span className="font-semibold text-foreground">{formatSearchVolume(totalSearchVolume)}</span>
                </span>
                <span>
                  Avg Vol: <span className="font-semibold text-foreground">{formatSearchVolume(avgSearchVolume)}</span>
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              {selectedKeywords.map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center justify-between p-2 rounded-md border border-border bg-muted/30 hover:bg-destructive/10 group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{kw.name}</span>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${getPlatformColor(kw.platform)}`}>
                      {kw.platform === "google" ? "G" : "TT"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatSearchVolume(kw.avgMonthlySearches)}/mo
                    </span>
                    {kw.competition && (
                      <Badge variant="outline" className="text-[10px]">
                        {kw.competition}
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-50 group-hover:opacity-100"
                      onClick={() => handleRemove(kw)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
