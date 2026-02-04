// Filters for assigned creatives view
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
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

  const adSetOptions = [
    { value: 'all', label: 'All Ad Sets' },
    ...availableOptions.adSets.map(a => ({ value: a, label: a }))
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    ...availableOptions.statuses.map(s => ({ value: s, label: s }))
  ];

  const mediaTypeOptions = [
    { value: 'all', label: 'All Media' },
    ...availableOptions.mediaTypes.map(t => ({ value: t, label: t }))
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filters:</span>
      </div>

      <Combobox
        options={platformOptions}
        value={filters.platform || 'all'}
        onValueChange={(v) => updateFilter('platform', v)}
        placeholder="Platform"
        searchPlaceholder="Search platforms..."
        className="w-[120px] h-8 text-xs"
      />

      <Combobox
        options={marketOptions}
        value={filters.market || 'all'}
        onValueChange={(v) => updateFilter('market', v)}
        placeholder="Market"
        searchPlaceholder="Search markets..."
        className="w-[110px] h-8 text-xs"
      />

      <Combobox
        options={phaseOptions}
        value={filters.phase || 'all'}
        onValueChange={(v) => updateFilter('phase', v)}
        placeholder="Phase"
        searchPlaceholder="Search phases..."
        className="w-[110px] h-8 text-xs"
      />

      <Combobox
        options={adSetOptions}
        value={filters.adSet || 'all'}
        onValueChange={(v) => updateFilter('adSet', v)}
        placeholder="Ad Set"
        searchPlaceholder="Search ad sets..."
        className="w-[140px] h-8 text-xs"
      />

      <Combobox
        options={statusOptions}
        value={filters.status || 'all'}
        onValueChange={(v) => updateFilter('status', v)}
        placeholder="Status"
        searchPlaceholder="Search status..."
        className="w-[100px] h-8 text-xs"
      />

      <Combobox
        options={mediaTypeOptions}
        value={filters.mediaType || 'all'}
        onValueChange={(v) => updateFilter('mediaType', v)}
        placeholder="Media"
        searchPlaceholder="Search media types..."
        className="w-[100px] h-8 text-xs"
      />

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-2 text-xs">
          <X className="h-3 w-3 mr-1" />
          Clear ({activeFilterCount})
        </Button>
      )}
    </div>
  );
}
