import { useState, useMemo } from 'react';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Filter, X, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OverviewFilters {
  status: string | null;
  pacingStatus: string | null;
  platform: string | null;
  performanceStatus: string | null;
  boSearch: string | null;
  nameSearch: string | null;
  activityStatus: string | null;
}

interface OverviewFiltersProps {
  filters: OverviewFilters;
  onFiltersChange: (filters: OverviewFilters) => void;
  availablePlatforms: string[];
  availableBoNumbers: string[];
  availableNames: string[];
}

const statusOptions = [
  { value: 'live', label: 'Live' },
  { value: 'pushed_to_dsp', label: 'Pushed' },
  { value: 'partially_pushed', label: 'Partial' },
  { value: 'ended', label: 'Ended' },
  { value: 'waiting_for_final_qc', label: 'Waiting for Final Check' },
  { value: 'qc', label: 'Checked' },
  { value: 'pushed_live', label: 'Pushed Live' },
  { value: 'delivering', label: 'Delivering' },
];

const pacingStatusOptions = [
  { value: 'on-track', label: 'On Track' },
  { value: 'overpacing', label: 'Overpacing' },
  { value: 'underpacing', label: 'Underpacing' },
];

const basePerformanceStatuses = [
  { value: 'overachieving', label: 'Overachieving' },
  { value: 'on-target', label: 'On Target' },
  { value: 'underachieving', label: 'Underachieving' },
];

const activityStatusOptions = [
  { value: 'no_changes_30d', label: 'No Changes (30d)' },
  { value: 'no_changes_7d', label: 'No Changes (7d)' },
  { value: 'no_optimization_30d', label: 'No Optimization (30d)' },
  { value: 'no_optimization_7d', label: 'No Optimization (7d)' },
  { value: 'no_notes_30d', label: 'No Notes (30d)' },
  { value: 'no_notes_7d', label: 'No Notes (7d)' },
];

// Generate platform-specific performance options dynamically
const generatePerformanceOptions = (platforms: string[]) => {
  const options: { value: string; label: string }[] = [];
  
  // Add platform-specific options
  platforms.forEach(platform => {
    const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
    basePerformanceStatuses.forEach(status => {
      options.push({
        value: `${platform}:${status.value}`,
        label: `${platformLabel} - ${status.label}`,
      });
    });
  });
  
  return options;
};

export function OverviewFiltersBar({ 
  filters, 
  onFiltersChange, 
  availablePlatforms,
  availableBoNumbers,
  availableNames,
}: OverviewFiltersProps) {
  const [boOpen, setBoOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  
  const activeFilterCount = Object.values(filters).filter(v => v !== null && v !== '').length;

  const updateFilter = (key: keyof OverviewFilters, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value === 'all' || value === '' ? null : value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      status: null,
      pacingStatus: null,
      platform: null,
      performanceStatus: null,
      boSearch: null,
      nameSearch: null,
      activityStatus: null,
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4 p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="font-medium">Filters:</span>
      </div>

      {/* BO Number Search Dropdown */}
      <Popover open={boOpen} onOpenChange={setBoOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={boOpen}
            className="w-[140px] h-8 text-xs justify-between"
          >
            {filters.boSearch ? (
              <span className="truncate">{filters.boSearch}</span>
            ) : (
              <span className="text-muted-foreground">BO Number</span>
            )}
            <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search BO..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No BO found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value=""
                  onSelect={() => {
                    updateFilter('boSearch', null);
                    setBoOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", !filters.boSearch ? "opacity-100" : "opacity-0")} />
                  All BO Numbers
                </CommandItem>
                {availableBoNumbers.map((bo) => (
                  <CommandItem
                    key={bo}
                    value={bo}
                    onSelect={() => {
                      updateFilter('boSearch', bo);
                      setBoOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-3 w-3", filters.boSearch === bo ? "opacity-100" : "opacity-0")} />
                    {bo}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* ActiPlan Name Search Dropdown */}
      <Popover open={nameOpen} onOpenChange={setNameOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={nameOpen}
            className="w-[160px] h-8 text-xs justify-between"
          >
            {filters.nameSearch ? (
              <span className="truncate">{filters.nameSearch}</span>
            ) : (
              <span className="text-muted-foreground">ActiPlan Name</span>
            )}
            <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search name..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No ActiPlan found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value=""
                  onSelect={() => {
                    updateFilter('nameSearch', null);
                    setNameOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", !filters.nameSearch ? "opacity-100" : "opacity-0")} />
                  All ActiPlans
                </CommandItem>
                {availableNames.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      updateFilter('nameSearch', name);
                      setNameOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-3 w-3", filters.nameSearch === name ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Combobox
        options={[
          { value: 'all', label: 'All Status' },
          ...statusOptions.map(opt => ({ value: opt.value, label: opt.label }))
        ]}
        value={filters.status || 'all'}
        onValueChange={(v) => updateFilter('status', v)}
        placeholder="Status"
        searchPlaceholder="Search status..."
        className="w-[120px] h-8 text-xs"
      />

      <Combobox
        options={[
          { value: 'all', label: 'All Pacing' },
          ...pacingStatusOptions.map(opt => ({ value: opt.value, label: opt.label }))
        ]}
        value={filters.pacingStatus || 'all'}
        onValueChange={(v) => updateFilter('pacingStatus', v)}
        placeholder="Pacing"
        searchPlaceholder="Search pacing..."
        className="w-[130px] h-8 text-xs"
      />

      <Combobox
        options={[
          { value: 'all', label: 'All Platforms' },
          ...availablePlatforms.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))
        ]}
        value={filters.platform || 'all'}
        onValueChange={(v) => updateFilter('platform', v)}
        placeholder="Platform"
        searchPlaceholder="Search platforms..."
        className="w-[120px] h-8 text-xs"
      />

      <Combobox
        options={[
          { value: 'all', label: 'All Performance' },
          ...generatePerformanceOptions(availablePlatforms).map(opt => ({ value: opt.value, label: opt.label }))
        ]}
        value={filters.performanceStatus || 'all'}
        onValueChange={(v) => updateFilter('performanceStatus', v)}
        placeholder="Performance"
        searchPlaceholder="Search performance..."
        className="w-[180px] h-8 text-xs"
      />

      <Combobox
        options={[
          { value: 'all', label: 'All Activity' },
          ...activityStatusOptions.map(opt => ({ value: opt.value, label: opt.label }))
        ]}
        value={filters.activityStatus || 'all'}
        onValueChange={(v) => updateFilter('activityStatus', v)}
        placeholder="Activity Status"
        searchPlaceholder="Search activity..."
        className="w-[180px] h-8 text-xs"
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
