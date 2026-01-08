import { Button } from '@/components/ui/button';
import { 
  ChevronsDownUp, 
  ChevronsUpDown, 
  Layers, 
  Globe, 
  FolderTree 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TreeViewControlsProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandLevel: (level: 'platforms' | 'markets' | 'campaigns') => void;
  onCollapseLevel: (level: 'platforms' | 'markets' | 'campaigns') => void;
}

export function TreeViewControls({
  onExpandAll,
  onCollapseAll,
  onExpandLevel,
  onCollapseLevel,
}: TreeViewControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onExpandAll} className="h-7 px-2 text-xs">
        <ChevronsUpDown className="h-3 w-3 mr-1" />
        Expand All
      </Button>
      <Button variant="ghost" size="sm" onClick={onCollapseAll} className="h-7 px-2 text-xs">
        <ChevronsDownUp className="h-3 w-3 mr-1" />
        Collapse All
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Layers className="h-3 w-3 mr-1" />
            By Level
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs">Expand</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onExpandLevel('platforms')} className="text-xs">
            <Layers className="h-3 w-3 mr-2" />
            Platforms Only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExpandLevel('markets')} className="text-xs">
            <Globe className="h-3 w-3 mr-2" />
            Markets Only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExpandLevel('campaigns')} className="text-xs">
            <FolderTree className="h-3 w-3 mr-2" />
            Campaigns Only
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Collapse</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onCollapseLevel('platforms')} className="text-xs">
            <Layers className="h-3 w-3 mr-2" />
            Platforms Only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCollapseLevel('markets')} className="text-xs">
            <Globe className="h-3 w-3 mr-2" />
            Markets Only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCollapseLevel('campaigns')} className="text-xs">
            <FolderTree className="h-3 w-3 mr-2" />
            Campaigns Only
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
