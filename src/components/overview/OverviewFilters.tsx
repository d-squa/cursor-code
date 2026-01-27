import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OverviewFilters {
  status: string | null;
  pacingStatus: string | null;
  platform: string | null;
  performanceStatus: string | null;
}

interface OverviewFiltersProps {
  filters: OverviewFilters;
  onFiltersChange: (filters: OverviewFilters) => void;
  availablePlatforms: string[];
}

const statusOptions = [
  { value: 'live', label: 'Live' },
  { value: 'pushed_to_dsp', label: 'Pushed' },
  { value: 'partially_pushed', label: 'Partial' },
  { value: 'ended', label: 'Ended' },
];

const pacingStatusOptions = [
  { value: 'on-track', label: 'On Track' },
  { value: 'overpacing', label: 'Overpacing' },
  { value: 'underpacing', label: 'Underpacing' },
];

const performanceStatusOptions = [
  { value: 'overachieving', label: 'Overachieving' },
  { value: 'on-target', label: 'On Target' },
  { value: 'underachieving', label: 'Underachieving' },
];

export function OverviewFiltersBar({ 
  filters, 
  onFiltersChange, 
  availablePlatforms 
}: OverviewFiltersProps) {
  const activeFilterCount = Object.values(filters).filter(v => v !== null).length;

  const updateFilter = (key: keyof OverviewFilters, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value === 'all' ? null : value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      status: null,
      pacingStatus: null,
      platform: null,
      performanceStatus: null,
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4 p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="font-medium">Filters:</span>
      </div>

      <Select value={filters.status || 'all'} onValueChange={(v) => updateFilter('status', v)}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {statusOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.pacingStatus || 'all'} onValueChange={(v) => updateFilter('pacingStatus', v)}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Pacing" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Pacing</SelectItem>
          {pacingStatusOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.platform || 'all'} onValueChange={(v) => updateFilter('platform', v)}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue placeholder="Platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Platforms</SelectItem>
          {availablePlatforms.map(p => (
            <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.performanceStatus || 'all'} onValueChange={(v) => updateFilter('performanceStatus', v)}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Performance" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Performance</SelectItem>
          {performanceStatusOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
