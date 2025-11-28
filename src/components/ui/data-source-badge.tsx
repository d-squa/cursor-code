import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DataSourceBadgeProps {
  dataSource: 'live_api' | 'estimated';
  platformName?: string;
}

export function DataSourceBadge({ dataSource, platformName = "Platform" }: DataSourceBadgeProps) {
  if (dataSource === 'live_api') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
              <Activity className="h-3 w-3" />
              Live API
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Data fetched directly from {platformName} API</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1">
            <TrendingUp className="h-3 w-3" />
            Estimated
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Data estimated from benchmarks and calculations</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
