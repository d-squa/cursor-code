import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelect({ options, value, onChange, placeholder = "Select", emptyText = "No options found", className, disabled }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggleValue = (v: string) => {
    const exists = value.includes(v);
    const newValues = exists ? value.filter((x) => x !== v) : [...value, v];
    onChange(newValues);
  };

  const selectedLabels = React.useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label] as const));
    return value.map((v) => map.get(v) ?? v);
  }, [options, value]);

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between", disabled && "opacity-60")}
            disabled={disabled}
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>{value.length === 0 ? placeholder : `${value.length} selected`}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0 z-50 bg-popover text-popover-foreground" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const checked = value.includes(opt.value);
                  return (
                    <CommandItem key={opt.value} onSelect={() => toggleValue(opt.value)} className="cursor-pointer">
                      <Checkbox checked={checked} className="mr-2" aria-hidden />
                      <span className="flex-1">{opt.label}</span>
                      {checked && <Check className="h-4 w-4" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedLabels.map((label, idx) => (
            <Badge key={`${label}-${idx}`} variant="secondary">{label}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
