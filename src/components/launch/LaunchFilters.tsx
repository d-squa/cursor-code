import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Filter, X } from 'lucide-react';

export interface LaunchFilters {
  platform: string | null;
  market: string | null;
  phase: string | null;
}

interface LaunchFiltersProps {
  filters: LaunchFilters;
  onFiltersChange: (filters: LaunchFilters) => void;
  availableOptions: {
    platforms: string[];
    markets: string[];
    phases: string[];
  };
}

export function LaunchFiltersBar({ 
  filters, 
  onFiltersChange, 
  availableOptions 
}: LaunchFiltersProps) {
  const activeFilterCount = Object.values(filters).filter(v => v !== null).length;

  const updateFilter = (key: keyof LaunchFilters, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value === 'all' ? null : value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      platform: null,
      market: null,
      phase: null,
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="font-medium">Filters:</span>
      </div>

      <Select value={filters.platform || 'all'} onValueChange={(v) => updateFilter('platform', v)}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Platforms</SelectItem>
          {availableOptions.platforms.map(p => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.market || 'all'} onValueChange={(v) => updateFilter('market', v)}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue placeholder="Market" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Markets</SelectItem>
          {availableOptions.markets.map(m => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.phase || 'all'} onValueChange={(v) => updateFilter('phase', v)}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Phase" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Phases</SelectItem>
          {availableOptions.phases.map(p => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-2 text-xs">
          <X className="h-3 w-3 mr-1" />
          Clear ({activeFilterCount})
        </Button>
      )}
    </div>
  );
}
