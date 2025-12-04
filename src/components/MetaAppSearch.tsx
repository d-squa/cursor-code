import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetaApp {
  id: string;
  name: string;
  type?: string;
  description?: string;
  audience_size?: string;
}

interface Props {
  appStore: string | null;
  adAccountId: string;
  value: string | null;
  onChange: (appId: string | null, appName?: string) => void;
  disabled?: boolean;
}

export default function MetaAppSearch({ appStore, adAccountId, value, onChange, disabled }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<MetaApp[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedApp, setSelectedApp] = useState<MetaApp | null>(null);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !appStore) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await supabase.functions.invoke("search-meta-apps", {
          body: {
            query: searchQuery,
            appStore: appStore,
            adAccountId: adAccountId.replace("act_", ""),
          },
        });

        if (response.data?.apps) {
          setResults(response.data.apps);
          setShowResults(true);
        }
      } catch (error) {
        console.error("Error searching apps:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, appStore, adAccountId]);

  const handleSelect = useCallback((app: MetaApp) => {
    setSelectedApp(app);
    onChange(app.id, app.name);
    setShowResults(false);
    setSearchQuery("");
  }, [onChange]);

  const handleClear = useCallback(() => {
    setSelectedApp(null);
    onChange(null);
    setSearchQuery("");
  }, [onChange]);

  // Sync external value with selected app
  useEffect(() => {
    if (!value && selectedApp) {
      setSelectedApp(null);
    }
  }, [value, selectedApp]);

  if (!appStore) {
    return (
      <div className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/50">
        Select an app store first to search for apps
      </div>
    );
  }

  return (
    <div className="relative">
      {selectedApp || value ? (
        <div className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
          <div className="flex-1">
            <p className="font-medium text-sm">{selectedApp?.name || `App ID: ${value}`}</p>
            {selectedApp?.description && (
              <p className="text-xs text-muted-foreground truncate">{selectedApp.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="h-7 w-7 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for app by name..."
              className="pl-9"
              disabled={disabled}
              onFocus={() => results.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {showResults && results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
              {results.map((app) => (
                <button
                  key={app.id}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-accent cursor-pointer",
                    "border-b last:border-b-0"
                  )}
                  onClick={() => handleSelect(app)}
                >
                  <p className="font-medium text-sm">{app.name}</p>
                  {app.audience_size && (
                    <p className="text-xs text-muted-foreground">
                      Audience: {app.audience_size}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {showResults && searchQuery.length >= 2 && results.length === 0 && !isSearching && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3">
              <p className="text-sm text-muted-foreground">No apps found</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}