// Filters for assigned creatives view
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Filter } from 'lucide-react';

export interface CreativeFilters {
  platform: string | null;
  market: string | null;
  phase: string | null;
  adSet: string | null;
  status: string | null;
  mediaType: string | null;
}

interface AssignedCreativesFiltersProps {
  filters: CreativeFilters;
  onFiltersChange: (filters: CreativeFilters) => void;
  availableOptions: {
    platforms: string[];
    markets: string[];
    phases: string[];
    adSets: string[];
    statuses: string[];
    mediaTypes: string[];
  };
}

export function AssignedCreativesFilters({ 
  filters, 
  onFiltersChange, 
  availableOptions 
}: AssignedCreativesFiltersProps) {
  const activeFilterCount = Object.values(filters).filter(v => v !== null).length;

  const updateFilter = (key: keyof CreativeFilters, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value === 'all' ? null : value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      platform: null,
      market: null,
      phase: null,
      adSet: null,
      status: null,
      mediaType: null,
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filters:</span>
      </div>

      <Select value={filters.platform || 'all'} onValueChange={(v) => updateFilter('platform', v)}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
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
        <SelectTrigger className="w-[110px] h-8 text-xs">
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
        <SelectTrigger className="w-[110px] h-8 text-xs">
          <SelectValue placeholder="Phase" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Phases</SelectItem>
          {availableOptions.phases.map(p => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.adSet || 'all'} onValueChange={(v) => updateFilter('adSet', v)}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Ad Set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Ad Sets</SelectItem>
          {availableOptions.adSets.map(a => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status || 'all'} onValueChange={(v) => updateFilter('status', v)}>
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {availableOptions.statuses.map(s => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.mediaType || 'all'} onValueChange={(v) => updateFilter('mediaType', v)}>
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Media" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Media</SelectItem>
          {availableOptions.mediaTypes.map(t => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
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
