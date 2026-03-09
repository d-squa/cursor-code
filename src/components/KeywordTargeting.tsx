import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Search, X, Plus, KeyRound, Ban, ChevronDown, ChevronRight, Target, ShieldCheck, Swords } from "lucide-react";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type KeywordStrategy = "brand" | "generic" | "competition";
export type KeywordMatchType = "exact" | "phrase" | "broad";

export interface KeywordItem {
  id: string;
  name: string;
  platform: "google" | "tiktok";
  avgMonthlySearches?: number;
  competition?: string;
  cpcLow?: number;
  cpcHigh?: number;
  strategy?: KeywordStrategy;
  matchType?: KeywordMatchType;
  isNegative?: boolean;
}

interface KeywordTargetingProps {
  selectedKeywords: KeywordItem[];
  onUpdate: (keywords: KeywordItem[]) => void;
  googleCustomerId?: string;
  tiktokAdvertiserId?: string;
}

const STRATEGY_META: Record<KeywordStrategy, { label: string; icon: React.ReactNode; color: string }> = {
  brand: { label: "Brand", icon: <ShieldCheck className="h-3.5 w-3.5" />, color: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800" },
  generic: { label: "Generic", icon: <Target className="h-3.5 w-3.5" />, color: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800" },
  competition: { label: "Competition", icon: <Swords className="h-3.5 w-3.5" />, color: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800" },
};

const MATCH_TYPE_LABELS: Record<KeywordMatchType, string> = {
  exact: "[Exact]",
  phrase: '"Phrase"',
  broad: "Broad",
};

export function KeywordTargeting({
  selectedKeywords,
  onUpdate,
  googleCustomerId,
  tiktokAdvertiserId,
}: KeywordTargetingProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<KeywordItem[]>([]);
  const [defaultMatchType, setDefaultMatchType] = useState<KeywordMatchType>("broad");

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

  const addKeyword = (kw: KeywordItem, strategy: KeywordStrategy, isNegative: boolean) => {
    // Remove any existing entry with same id to allow re-categorization
    const filtered = selectedKeywords.filter((s) => s.id !== kw.id);
    const newKw: KeywordItem = {
      ...kw,
      strategy,
      matchType: defaultMatchType,
      isNegative,
    };
    onUpdate([...filtered, newKw]);
    toast.success(`${isNegative ? "Negated" : "Added"} "${kw.name}" → ${STRATEGY_META[strategy].label}`);
  };

  const handleRemove = (kw: KeywordItem) => {
    onUpdate(selectedKeywords.filter((s) => s.id !== kw.id));
  };

  const handleBulkAdd = (strategy: KeywordStrategy, isNegative: boolean) => {
    const newKeywords = results
      .filter((kw) => !selectedKeywords.some((s) => s.id === kw.id))
      .map((kw) => ({
        ...kw,
        strategy,
        matchType: defaultMatchType,
        isNegative,
      }));
    if (newKeywords.length === 0) {
      toast.info("All keywords already added");
      return;
    }
    onUpdate([...selectedKeywords, ...newKeywords]);
    toast.success(`${isNegative ? "Negated" : "Added"} ${newKeywords.length} keywords → ${STRATEGY_META[strategy].label}`);
  };

  const updateMatchType = (kwId: string, matchType: KeywordMatchType) => {
    onUpdate(
      selectedKeywords.map((kw) =>
        kw.id === kwId ? { ...kw, matchType } : kw
      )
    );
  };

  const getByStrategy = (strategy: KeywordStrategy) =>
    selectedKeywords.filter((kw) => kw.strategy === strategy);

  const totalSearchVolume = selectedKeywords.reduce((sum, kw) => sum + (kw.avgMonthlySearches || 0), 0);

  const formatSearchVolume = (vol?: number) => {
    if (!vol) return "N/A";
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
    return String(vol);
  };

  const getPlatformColor = (platform: string) => {
    return platform === "google" ? "border-green-200" : "border-pink-200";
  };

  const StrategyDropdown = ({ kw, isNegative, label, icon }: { kw: KeywordItem; isNegative: boolean; label: string; icon: React.ReactNode }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={isNegative ? "destructive" : "outline"} className="h-7 text-xs gap-1">
          {icon}
          {label}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(STRATEGY_META) as KeywordStrategy[]).map((strategy) => (
          <DropdownMenuItem
            key={strategy}
            onClick={() => addKeyword(kw, strategy, isNegative)}
            className="gap-2"
          >
            {STRATEGY_META[strategy].icon}
            {STRATEGY_META[strategy].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const BulkStrategyDropdown = ({ isNegative }: { isNegative: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={isNegative ? "destructive" : "outline"} className="text-xs h-7 gap-1">
          {isNegative ? <Ban className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {isNegative ? "Negate All" : "Add All"}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(STRATEGY_META) as KeywordStrategy[]).map((strategy) => (
          <DropdownMenuItem
            key={strategy}
            onClick={() => handleBulkAdd(strategy, isNegative)}
            className="gap-2"
          >
            {STRATEGY_META[strategy].icon}
            {STRATEGY_META[strategy].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderStrategyTab = (strategy: KeywordStrategy) => {
    const keywords = getByStrategy(strategy);
    const positives = keywords.filter((kw) => !kw.isNegative);
    const negatives = keywords.filter((kw) => kw.isNegative);
    const meta = STRATEGY_META[strategy];

    return (
      <div className="space-y-3">
        {keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No {meta.label.toLowerCase()} keywords added yet. Use the search above to find and add keywords.
          </p>
        ) : (
          <>
            {positives.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
                  <ChevronRight className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                  Positive ({positives.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1.5 mt-1.5">
                  {positives.map((kw) => (
                    <KeywordRow key={kw.id} kw={kw} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
            {negatives.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-destructive uppercase tracking-wider hover:text-destructive/80 transition-colors w-full">
                  <ChevronRight className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                  Negative ({negatives.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1.5 mt-1.5">
                  {negatives.map((kw) => (
                    <KeywordRow key={kw.id} kw={kw} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>
    );
  };

  const KeywordRow = ({ kw }: { kw: KeywordItem }) => (
    <div
      className={`flex items-center justify-between p-2 rounded-md border group ${
        kw.isNegative
          ? "bg-destructive/5 border-destructive/20"
          : "bg-muted/30 border-border"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {kw.isNegative && <Ban className="h-3 w-3 text-destructive shrink-0" />}
        <span className="text-sm font-medium truncate">{kw.name}</span>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${getPlatformColor(kw.platform)}`}>
          {kw.platform === "google" ? "G" : "TT"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatSearchVolume(kw.avgMonthlySearches)}/mo
          </span>
          <DataSourceBadge dataSource="live_api" platformName={kw.platform === "google" ? "Google Ads" : "TikTok"} />
        </div>
        <Select
          value={kw.matchType || "broad"}
          onValueChange={(val) => updateMatchType(kw.id, val as KeywordMatchType)}
        >
          <SelectTrigger className="h-6 w-[90px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exact">[Exact]</SelectItem>
            <SelectItem value="phrase">"Phrase"</SelectItem>
            <SelectItem value="broad">Broad</SelectItem>
          </SelectContent>
        </Select>
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
  );

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
            className="flex-1"
          />
          <Select value={defaultMatchType} onValueChange={(v) => setDefaultMatchType(v as KeywordMatchType)}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exact">[Exact]</SelectItem>
              <SelectItem value="phrase">"Phrase"</SelectItem>
              <SelectItem value="broad">Broad</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                Suggestions ({results.length})
              </p>
              <div className="flex gap-1.5">
                <BulkStrategyDropdown isNegative={false} />
                <BulkStrategyDropdown isNegative={true} />
              </div>
            </div>
            <ScrollArea className="h-[320px]">
              <div className="space-y-2">
                {results.map((kw) => {
                  const existing = selectedKeywords.find((s) => s.id === kw.id);
                  return (
                    <div
                      key={kw.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        existing
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
                          {existing && (
                            <Badge className={`text-[10px] ${STRATEGY_META[existing.strategy || "generic"].color}`}>
                              {existing.isNegative ? "−" : "+"} {STRATEGY_META[existing.strategy || "generic"].label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Vol: {formatSearchVolume(kw.avgMonthlySearches)}</span>
                          {kw.competition && <span>Comp: {kw.competition}</span>}
                          {kw.cpcHigh ? <span>CPC: ${kw.cpcLow?.toFixed(2)}-${kw.cpcHigh?.toFixed(2)}</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <StrategyDropdown kw={kw} isNegative={false} label="Add" icon={<Plus className="h-3 w-3" />} />
                        <StrategyDropdown kw={kw} isNegative={true} label="Negate" icon={<Ban className="h-3 w-3" />} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Selected Keywords by Strategy */}
        {selectedKeywords.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Keyword Lists ({selectedKeywords.length} total)
              </p>
              <span className="text-xs text-muted-foreground">
                Total Vol: <span className="font-semibold text-foreground">{formatSearchVolume(totalSearchVolume)}</span>
              </span>
            </div>
            <Tabs defaultValue="brand" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                {(Object.keys(STRATEGY_META) as KeywordStrategy[]).map((strategy) => {
                  const count = getByStrategy(strategy).length;
                  const meta = STRATEGY_META[strategy];
                  return (
                    <TabsTrigger key={strategy} value={strategy} className="gap-1.5 text-xs">
                      {meta.icon}
                      {meta.label}
                      {count > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-[18px] text-[10px] px-1">
                          {count}
                        </Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {(Object.keys(STRATEGY_META) as KeywordStrategy[]).map((strategy) => (
                <TabsContent key={strategy} value={strategy} className="mt-3">
                  {renderStrategyTab(strategy)}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
