import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Filter, X, Search } from 'lucide-react';

export interface LaunchFilters {
  platform: string | null;
  market: string | null;
  phase: string | null;
  parameterSearch: string | null;
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
  const activeFilterCount = Object.values(filters).filter(v => v !== null && v !== '').length;

  const updateFilter = (key: keyof LaunchFilters, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value === 'all' ? null : value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      platform: null,
      market: null,
      phase: null,
      parameterSearch: null,
    });
  };

  const platformOptions = [
    { value: 'all', label: 'All Platforms' },
    ...availableOptions.platforms.map(p => ({ value: p, label: p }))
  ];

  const marketOptions = [
    { value: 'all', label: 'All Markets' },
    ...availableOptions.markets.map(m => ({ value: m, label: m }))
  ];

  const phaseOptions = [
    { value: 'all', label: 'All Phases' },
    ...availableOptions.phases.map(p => ({ value: p, label: p }))
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="font-medium">Filters:</span>
      </div>

      <Combobox
        options={platformOptions}
        value={filters.platform || 'all'}
        onValueChange={(v) => updateFilter('platform', v)}
        placeholder="Platform"
        searchPlaceholder="Search platforms..."
        className="w-[130px] h-8 text-xs"
      />

      <Combobox
        options={marketOptions}
        value={filters.market || 'all'}
        onValueChange={(v) => updateFilter('market', v)}
        placeholder="Market"
        searchPlaceholder="Search markets..."
        className="w-[120px] h-8 text-xs"
      />

      <Combobox
        options={phaseOptions}
        value={filters.phase || 'all'}
        onValueChange={(v) => updateFilter('phase', v)}
        placeholder="Phase"
        searchPlaceholder="Search phases..."
        className="w-[130px] h-8 text-xs"
      />

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Search parameters..."
          value={filters.parameterSearch || ''}
          onChange={(e) => updateFilter('parameterSearch', e.target.value || null)}
          className="w-[180px] h-8 text-xs pl-7"
        />
      </div>

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-2 text-xs">
          <X className="h-3 w-3 mr-1" />
          Clear ({activeFilterCount})
        </Button>
      )}
    </div>
  );
}
