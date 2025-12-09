import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

interface DashboardFiltersProps {
  platforms: string[];
  markets: string[];
  objectives: string[];
  optimizationGoals: string[];
  selectedPlatforms: string[];
  selectedMarkets: string[];
  selectedObjective: string;
  selectedOptimizationGoal: string;
  dateRange: DateRange | undefined;
  granularity: 'weekly' | 'monthly';
  onPlatformToggle: (platform: string) => void;
  onMarketToggle: (market: string) => void;
  onObjectiveChange: (value: string) => void;
  onOptimizationGoalChange: (value: string) => void;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onGranularityChange: (value: 'weekly' | 'monthly') => void;
  onClearFilters: () => void;
}

export default function DashboardFilters({
  platforms,
  markets,
  objectives,
  optimizationGoals,
  selectedPlatforms,
  selectedMarkets,
  selectedObjective,
  selectedOptimizationGoal,
  dateRange,
  granularity,
  onPlatformToggle,
  onMarketToggle,
  onObjectiveChange,
  onOptimizationGoalChange,
  onDateRangeChange,
  onGranularityChange,
  onClearFilters,
}: DashboardFiltersProps) {
  const hasActiveFilters = 
    selectedPlatforms.length > 0 || 
    selectedMarkets.length > 0 || 
    selectedObjective !== 'all' || 
    selectedOptimizationGoal !== 'all' ||
    dateRange !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      {/* Platforms */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Platforms:</span>
        <div className="flex gap-1">
          {platforms.map((platform) => (
            <Badge
              key={platform}
              variant={selectedPlatforms.includes(platform) ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => onPlatformToggle(platform)}
            >
              {platform}
            </Badge>
          ))}
        </div>
      </div>

      {/* Markets */}
      {markets.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Markets:</span>
          <div className="flex gap-1 flex-wrap">
            {markets.map((market) => (
              <Badge
                key={market}
                variant={selectedMarkets.includes(market) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => onMarketToggle(market)}
              >
                {market}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Objective */}
      {objectives.length > 1 && (
        <Select value={selectedObjective} onValueChange={onObjectiveChange}>
          <SelectTrigger className="w-[160px] h-8">
            <SelectValue placeholder="Objective" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Objectives</SelectItem>
            {objectives.map((obj) => (
              <SelectItem key={obj} value={obj} className="capitalize">{obj}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Optimization Goal */}
      {optimizationGoals.length > 1 && (
        <Select value={selectedOptimizationGoal} onValueChange={onOptimizationGoalChange}>
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder="Optimization Goal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Goals</SelectItem>
            {optimizationGoals.map((goal) => (
              <SelectItem key={goal} value={goal} className="capitalize">{goal.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Date Range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <CalendarIcon className="h-4 w-4 mr-2" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                </>
              ) : (
                format(dateRange.from, "MMM d, yyyy")
              )
            ) : (
              "Date Range"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={onDateRangeChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Granularity */}
      <Select value={granularity} onValueChange={(v) => onGranularityChange(v as 'weekly' | 'monthly')}>
        <SelectTrigger className="w-[110px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="weekly">Weekly</SelectItem>
          <SelectItem value="monthly">Monthly</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8">
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
