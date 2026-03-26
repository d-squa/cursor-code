import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Percent, Calendar } from "lucide-react";

export interface ForecastOptions {
  applyMarkup: boolean;
  markupDirection: "up" | "down";
  markupPercentage: number;
  benchmarkDateRange: BenchmarkDateRange;
}

export interface BenchmarkDateRange {
  preset: string;
  startDate?: string; // YYYY-MM format
  endDate?: string;   // YYYY-MM format
}

interface ForecastOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: ForecastOptions) => void;
}

const getPresetDates = (preset: string): { start: string; end: string } | null => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const fmt = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

  switch (preset) {
    case "last_month": {
      const d = new Date(year, month - 1, 1);
      return { start: fmt(d.getFullYear(), d.getMonth()), end: fmt(d.getFullYear(), d.getMonth()) };
    }
    case "last_3_months": {
      const s = new Date(year, month - 3, 1);
      const e = new Date(year, month - 1, 1);
      return { start: fmt(s.getFullYear(), s.getMonth()), end: fmt(e.getFullYear(), e.getMonth()) };
    }
    case "last_quarter": {
      const currentQ = Math.floor(month / 3);
      const prevQStart = new Date(year, (currentQ - 1) * 3, 1);
      const prevQEnd = new Date(year, currentQ * 3 - 1, 1);
      if (currentQ === 0) {
        return { start: fmt(year - 1, 9), end: fmt(year - 1, 11) };
      }
      return { start: fmt(prevQStart.getFullYear(), prevQStart.getMonth()), end: fmt(prevQEnd.getFullYear(), prevQEnd.getMonth()) };
    }
    case "same_month_last_year": {
      return { start: fmt(year - 1, month), end: fmt(year - 1, month) };
    }
    case "same_quarter_last_year": {
      const q = Math.floor(month / 3);
      return { start: fmt(year - 1, q * 3), end: fmt(year - 1, q * 3 + 2) };
    }
    case "same_period_last_year": {
      // Last 3 months, but one year ago
      const s = new Date(year - 1, month - 3, 1);
      const e = new Date(year - 1, month - 1, 1);
      return { start: fmt(s.getFullYear(), s.getMonth()), end: fmt(e.getFullYear(), e.getMonth()) };
    }
    default:
      return null;
  }
};

const presetLabels: Record<string, string> = {
  all: "All time (default)",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_quarter: "Last quarter",
  same_month_last_year: "Same month last year",
  same_quarter_last_year: "Same quarter last year",
  same_period_last_year: "Same period last year",
  custom: "Custom range",
};

export function ForecastOptionsDialog({ open, onOpenChange, onConfirm }: ForecastOptionsDialogProps) {
  const [applyMarkup, setApplyMarkup] = useState(false);
  const [markupDirection, setMarkupDirection] = useState<"up" | "down">("up");
  const [markupPercentage, setMarkupPercentage] = useState(10);
  const [datePreset, setDatePreset] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handleConfirm = () => {
    let benchmarkDateRange: BenchmarkDateRange = { preset: datePreset };

    if (datePreset === "custom") {
      benchmarkDateRange.startDate = customStart;
      benchmarkDateRange.endDate = customEnd;
    } else if (datePreset !== "all") {
      const dates = getPresetDates(datePreset);
      if (dates) {
        benchmarkDateRange.startDate = dates.start;
        benchmarkDateRange.endDate = dates.end;
      }
    }

    onConfirm({
      applyMarkup,
      markupDirection,
      markupPercentage,
      benchmarkDateRange,
    });
  };

  // Generate month options for custom picker (last 24 months)
  const monthOptions: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    monthOptions.push({ value: val, label });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Forecast Options
          </DialogTitle>
          <DialogDescription>
            Configure forecast settings before generating predictions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Markup Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Percent className="h-4 w-4" />
                  CPM Markup/Markdown
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Adjusts CPM — impressions, reach, and results recalculate accordingly.
                </p>
              </div>
              <Switch checked={applyMarkup} onCheckedChange={setApplyMarkup} />
            </div>
            
            {applyMarkup && (
              <div className="flex items-center gap-3 pl-6">
                <Select value={markupDirection} onValueChange={(v) => setMarkupDirection(v as "up" | "down")}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up">+ Markup</SelectItem>
                    <SelectItem value="down">− Markdown</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={markupPercentage}
                    onChange={(e) => setMarkupPercentage(Math.min(100, Math.max(1, Number(e.target.value))))}
                    className="w-[80px]"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {markupDirection === "up" ? "+" : "−"}{markupPercentage}%
                </Badge>
              </div>
            )}
          </div>

          {/* Benchmark Date Range Section */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              Benchmark Date Range
            </Label>
            <p className="text-xs text-muted-foreground">
              Select which historical period to use for benchmark data.
            </p>
            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger>
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(presetLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {datePreset === "custom" && (
              <div className="flex items-center gap-3 pl-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Start Month</Label>
                  <Select value={customStart} onValueChange={setCustomStart}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">End Month</Label>
                  <Select value={customEnd} onValueChange={setCustomEnd}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {datePreset !== "all" && datePreset !== "custom" && (
              <div className="text-xs text-muted-foreground pl-2">
                {(() => {
                  const dates = getPresetDates(datePreset);
                  if (!dates) return null;
                  const formatMonth = (ym: string) => {
                    const [y, m] = ym.split("-");
                    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { year: "numeric", month: "short" });
                  };
                  return `${formatMonth(dates.start)} → ${formatMonth(dates.end)}`;
                })()}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Generate Forecast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
