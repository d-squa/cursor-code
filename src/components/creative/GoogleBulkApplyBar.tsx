// Reusable bulk apply toolbar for the Google Search / Non-Search text asset
// editors. Matches the look-and-feel of the BulkParameterEditor used in
// TextAssetExcelEditor (Select / Parameter / Value / Apply) but is fully
// driven by the host editor: it does not own any row state and simply hands
// (parameterKey, value, scope) back via `onApply`.
//
// Each host editor passes a `parameters` list scoped to the campaign type it
// renders, so PMax shows 5 headlines + 5 long headlines + 5 descriptions,
// Demand Gen shows 5 headlines + 5 descriptions + business name + YouTube URL,
// Search shows 15 headlines + 6 descriptions + paths + final URL, etc.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Heading1,
  FileText,
  Type,
  MousePointer,
  Link as LinkIcon,
  Wand2,
  Target,
  Tag,
  Briefcase,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type ParameterValueType = 'text' | 'textarea' | 'url' | 'select';

export interface BulkParameterDef {
  /** Stable key used by the host's onApply callback. */
  key: string;
  /** Label shown in the parameter dropdown. */
  label: string;
  /** Optional subgroup label rendered as a non-selectable header. */
  group?: string;
  /** Input rendering hint. */
  type: ParameterValueType;
  placeholder?: string;
  /** Max characters allowed in the input. */
  maxLength?: number;
  /** Options for `select` type. */
  options?: Array<{ value: string; label: string }>;
  /** Optional icon override; falls back to a sensible default per type. */
  icon?: React.ReactNode;
}

export type BulkApplyScope = 'selection' | 'visible' | 'all';

interface SelectGroup {
  /** Value sent to onSelectScope. */
  value: string;
  label: string;
}

interface GoogleBulkApplyBarProps {
  /** Parameters available for the current ad type. */
  parameters: BulkParameterDef[];
  /** "Select" dropdown options (e.g. All Visible, None, Invalid, All PMax). */
  selectOptions: SelectGroup[];
  /** Number of currently-selected rows (drives the "Apply to selection" label). */
  selectedCount: number;
  /** Total number of visible rows (drives the "Apply to all visible" label). */
  visibleCount: number;
  /** Called when the user picks a "Select…" option. */
  onSelectScope: (value: string) => void;
  /** Called when the user clicks Apply. Returns the number of rows updated. */
  onApply: (parameterKey: string, value: string, scope: BulkApplyScope) => number;
  className?: string;
}

const DEFAULT_ICONS: Record<ParameterValueType, React.ReactNode> = {
  text: <Heading1 className="h-3.5 w-3.5" />,
  textarea: <FileText className="h-3.5 w-3.5" />,
  url: <LinkIcon className="h-3.5 w-3.5" />,
  select: <MousePointer className="h-3.5 w-3.5" />,
};

const PARAM_GROUP_ICONS: Record<string, React.ReactNode> = {
  Headlines: <Type className="h-3.5 w-3.5" />,
  'Long Headlines': <Heading1 className="h-3.5 w-3.5" />,
  Descriptions: <FileText className="h-3.5 w-3.5" />,
  Paths: <Tag className="h-3.5 w-3.5" />,
  URL: <LinkIcon className="h-3.5 w-3.5" />,
  Brand: <Briefcase className="h-3.5 w-3.5" />,
  Action: <MousePointer className="h-3.5 w-3.5" />,
  Media: <Sparkles className="h-3.5 w-3.5" />,
};

export function GoogleBulkApplyBar({
  parameters,
  selectOptions,
  selectedCount,
  visibleCount,
  onSelectScope,
  onApply,
  className,
}: GoogleBulkApplyBarProps) {
  const [activeKey, setActiveKey] = useState<string>(() => parameters[0]?.key ?? '');
  const [value, setValue] = useState<string>('');

  const activeParam = useMemo(
    () => parameters.find((p) => p.key === activeKey) ?? parameters[0],
    [parameters, activeKey],
  );

  // If the parameter list changes (e.g. campaign type filter switched) and the
  // currently-selected key is no longer available, fall back to the first one.
  if (activeParam && activeParam.key !== activeKey) {
    setActiveKey(activeParam.key);
  }

  // Group parameters in the dropdown for readability (Headlines 1..5, etc.).
  const grouped = useMemo(() => {
    const groups = new Map<string, BulkParameterDef[]>();
    parameters.forEach((p) => {
      const g = p.group || 'General';
      const arr = groups.get(g) || [];
      arr.push(p);
      groups.set(g, arr);
    });
    return Array.from(groups.entries());
  }, [parameters]);

  const handleApply = (scope: BulkApplyScope) => {
    if (!activeParam) {
      toast.error('Pick a parameter first');
      return;
    }
    const trimmed = value.trim();
    if (!trimmed && activeParam.type !== 'select') {
      toast.error(`Enter a ${activeParam.label.toLowerCase()} value first`);
      return;
    }
    if (scope === 'selection' && selectedCount === 0) {
      toast.error('No rows selected — pick rows or apply to all');
      return;
    }
    const finalValue = activeParam.maxLength ? trimmed.slice(0, activeParam.maxLength) : trimmed;
    const count = onApply(activeParam.key, activeParam.type === 'select' ? value : finalValue, scope);
    if (count === 0) {
      toast.info('No rows matched the selected scope');
      return;
    }
    toast.success(
      scope === 'selection'
        ? `Applied "${activeParam.label}" to ${count} selected row${count === 1 ? '' : 's'}`
        : scope === 'visible'
          ? `Applied "${activeParam.label}" to ${count} visible row${count === 1 ? '' : 's'}`
          : `Applied "${activeParam.label}" to ${count} row${count === 1 ? '' : 's'}`,
    );
    setValue('');
  };

  if (!activeParam) {
    return null;
  }

  const renderInput = () => {
    if (activeParam.type === 'select') {
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={activeParam.placeholder || `Select ${activeParam.label.toLowerCase()}…`} />
          </SelectTrigger>
          <SelectContent>
            {(activeParam.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (activeParam.type === 'textarea') {
      return (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={activeParam.placeholder || `Enter ${activeParam.label.toLowerCase()}…`}
          className="min-h-9 h-9 resize-y"
          maxLength={activeParam.maxLength}
        />
      );
    }
    return (
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={activeParam.placeholder || `Enter ${activeParam.label.toLowerCase()}…`}
        className="h-9"
        maxLength={activeParam.maxLength}
        type={activeParam.type === 'url' ? 'url' : 'text'}
      />
    );
  };

  return (
    <div
      className={cn(
        'bg-card/60 border-b px-4 py-3 shrink-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-end gap-3">
        {/* Select scope */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Select</label>
          <Select onValueChange={onSelectScope}>
            <SelectTrigger className="w-[180px] h-9">
              <Target className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parameter picker */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Parameter</label>
          <Select value={activeParam.key} onValueChange={(v) => { setActiveKey(v); setValue(''); }}>
            <SelectTrigger className="w-[220px] h-9">
              <span className="mr-1 inline-flex items-center text-muted-foreground">
                {activeParam.icon || PARAM_GROUP_ICONS[activeParam.group || ''] || DEFAULT_ICONS[activeParam.type]}
              </span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh]">
              {grouped.map(([groupName, params]) => (
                <div key={groupName}>
                  {grouped.length > 1 && (
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {groupName}
                    </div>
                  )}
                  {params.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      <span className="inline-flex items-center gap-2">
                        {p.icon || PARAM_GROUP_ICONS[p.group || ''] || DEFAULT_ICONS[p.type]}
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Value input */}
        <div className="space-y-1 flex-1 min-w-[260px]">
          <label className="text-xs font-medium text-muted-foreground">Value</label>
          {renderInput()}
        </div>

        {/* Apply (selection by default; dropdown variants for All / Visible) */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground opacity-0">Apply</label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={() => handleApply('selection')}
              disabled={selectedCount === 0}
              title={
                selectedCount === 0
                  ? 'Select rows first to enable Apply to selection'
                  : `Apply to ${selectedCount} selected row${selectedCount === 1 ? '' : 's'}`
              }
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Apply ({selectedCount})
            </Button>
            <Select onValueChange={(v) => handleApply(v as BulkApplyScope)}>
              <SelectTrigger className="h-9 w-[36px] px-2" aria-label="Apply scope" />
              <SelectContent align="end">
                <SelectItem value="visible">Apply to all visible ({visibleCount})</SelectItem>
                <SelectItem value="all">Apply to all rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
