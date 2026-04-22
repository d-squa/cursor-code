// Dedicated text-asset editor for Google Ads Search campaigns.
//
// This dialog is the single entry-point for authoring Google Search ad copy
// (RSA / Sitelink / Callout). It replaces the row-by-row experience of the main
// grid with a Google-Editor-style table where each row is one ad and the
// columns are the long list of Google-specific fields:
//
//   - Ad type (Text Ad / Sitelink / Callout)
//   - 15 headlines (with pinning P1/P2/P3)
//   -  6 descriptions (with pinning P1/P2)
//   - Path 1 / Path 2
//   - Final URL
//   - Business name
//
// It also renders a Google SERP-style preview, both inline (per-row, in the
// "Preview" column) and as a focused side panel for the currently-selected ad.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Copy, Clipboard, Trash2, Search, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

// ---------- Types ----------

export type GoogleAdSubtype = 'rsa' | 'sitelink' | 'callout';

const HEADLINE_COUNT = 15;
const DESCRIPTION_COUNT = 6;
const HEADLINE_MAX = 30;
const DESCRIPTION_MAX = 90;
const PATH_MAX = 15;
const BUSINESS_MAX = 25;

// In-memory editor model — one entry per Google Search ad row in the grid.
export interface GoogleSearchAdDraft {
  rowId: string;            // CreativeTextAssetRow.id
  assignmentId: string;     // for persistence (may be empty for shell placeholders)
  campaignName: string;
  adGroupName: string;
  market: string;
  subtype: GoogleAdSubtype;
  headlines: string[];      // length 15
  headlinePins: (number | null)[]; // length 15, value 1|2|3|null
  descriptions: string[];   // length 6
  descriptionPins: (number | null)[]; // length 6, value 1|2|null
  path1: string;
  path2: string;
  finalUrl: string;
  businessName: string;
}

interface GoogleSearchTextAssetEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All rows currently in the editor (filtered for Google Search inside). */
  rows: CreativeTextAssetRow[];
  /** Persist a single row update back to the parent state. */
  onRowChange: (rowId: string, updates: Partial<CreativeTextAssetRow>) => void;
  /** Persist a bulk update to multiple rows at once. */
  onBulkUpdate: (rowIds: string[], updates: Partial<CreativeTextAssetRow>) => void;
  /** Optional: permanently delete creative assignments by id. */
  onDeleteAssignments?: (assignmentIds: string[]) => void | Promise<void>;
}

// ---------- Helpers ----------

const SUBTYPE_LABEL: Record<GoogleAdSubtype, string> = {
  rsa: 'Text Ad (RSA)',
  sitelink: 'Sitelink',
  callout: 'Callout',
};

function isGoogleSearchRow(r: CreativeTextAssetRow): boolean {
  if ((r.platform || '').toLowerCase() !== 'google') return false;
  // Strict: only rows with googleCampaignType explicitly containing "search"
  // are treated as Search. Empty / missing type used to fall through and leak
  // PMax / Demand Gen / Video / Display rows into this editor — see Issue #129.
  // googleStrategy is also a reliable Search signal (Brand / Generic / Competition).
  const type = String(r.googleCampaignType || '').toLowerCase();
  if (type.includes('search')) return true;
  if (!type && !!r.googleStrategy) return true;
  return false;
}

/** Read a possibly-extended pins payload that may also carry overflow values. */
function readExtended(json: unknown): { values?: string[]; pins?: (number | null)[] } {
  if (!json) return {};
  if (Array.isArray(json)) return { pins: json.map((x) => (typeof x === 'number' ? x : null)) };
  if (typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const values = Array.isArray(obj.values) ? (obj.values as unknown[]).map((v) => String(v ?? '')) : undefined;
    const pinsArr = Array.isArray(obj.pins) ? (obj.pins as unknown[]).map((v) => (typeof v === 'number' ? v : null)) : undefined;
    return { values, pins: pinsArr };
  }
  if (typeof json === 'string') {
    try { return readExtended(JSON.parse(json)); } catch { return {}; }
  }
  return {};
}

function pad<T>(arr: T[] | undefined, length: number, filler: T): T[] {
  const out = (arr || []).slice(0, length);
  while (out.length < length) out.push(filler);
  return out;
}

function rowToDraft(row: CreativeTextAssetRow): GoogleSearchAdDraft {
  const r = row as any;
  // Headlines: cols 1..5 + overflow values in headline_pins.values
  const baseHeadlines = [r.headline, r.headline2, r.headline3, r.headline4, r.headline5].map((v) => String(v || ''));
  const headlineExt = readExtended(r.headline_pins ?? r.headlinePins);
  const headlines = pad(
    headlineExt.values && headlineExt.values.length >= HEADLINE_COUNT
      ? headlineExt.values
      : [...baseHeadlines, ...((headlineExt.values || []).slice(5))],
    HEADLINE_COUNT,
    '',
  );
  const headlinePins = pad(headlineExt.pins, HEADLINE_COUNT, null);

  const baseDesc = [r.description, r.description2, r.description3, r.description4, r.description5].map((v) => String(v || ''));
  const descExt = readExtended(r.description_pins ?? r.descriptionPins);
  const descriptions = pad(
    descExt.values && descExt.values.length >= DESCRIPTION_COUNT
      ? descExt.values
      : [...baseDesc, ...((descExt.values || []).slice(5))],
    DESCRIPTION_COUNT,
    '',
  );
  const descriptionPins = pad(descExt.pins, DESCRIPTION_COUNT, null);

  const subtype: GoogleAdSubtype =
    String(r.googleAdSubtype || r.adFormat || '').toLowerCase() === 'sitelink'
      ? 'sitelink'
      : String(r.googleAdSubtype || r.adFormat || '').toLowerCase() === 'callout'
      ? 'callout'
      : 'rsa';

  // Build the campaign label so it follows the same taxonomy formatting as
  // the ad-group label. For shells (and any row where `taxonomyCampaignName`
  // is just the raw client campaign name) we append the platform + market
  // suffix — mirroring the taxonomy fallback used elsewhere
  // (`<name>_<PLATFORM>_<MARKET>`).
  const rawCampaign =
    (row.taxonomyCampaignName && row.taxonomyCampaignName.trim()) ||
    (row.phase && row.phase.trim()) ||
    '';
  const platformUpper = (row.platform || 'GOOGLE').toUpperCase();
  const marketUpper = (row.market || '').toUpperCase();
  const alreadyHasTaxonomy =
    !!marketUpper && rawCampaign.toUpperCase().includes(`_${marketUpper}`);
  const campaignLabel = rawCampaign
    ? alreadyHasTaxonomy
      ? rawCampaign
      : marketUpper
        ? `${rawCampaign}_${platformUpper}_${marketUpper}`
        : rawCampaign
    : '';

  const adGroupLabel =
    (row.taxonomyAdSetName && row.taxonomyAdSetName.trim()) ||
    (row.adSet && row.adSet.trim()) ||
    '';

  return {
    rowId: row.id,
    assignmentId: row.assignmentId || '',
    campaignName: campaignLabel,
    adGroupName: adGroupLabel,
    market: row.market,
    subtype,
    headlines,
    headlinePins,
    descriptions,
    descriptionPins,
    path1: String(r.path_1 || r.displayPath || ''),
    path2: String(r.path_2 || ''),
    finalUrl: String(row.destinationUrl || ''),
    businessName: String(r.business_name || row.brandName || ''),
  };
}

function draftToRowUpdates(d: GoogleSearchAdDraft): Partial<CreativeTextAssetRow> {
  // Persist slots 1..5 directly into known columns; keep the full 15/6 lists +
  // pins inside the headline_pins / description_pins JSON so nothing is lost.
  const updates: Record<string, unknown> = {
    headline: d.headlines[0] || '',
    headline2: d.headlines[1] || '',
    headline3: d.headlines[2] || '',
    headline4: d.headlines[3] || '',
    headline5: d.headlines[4] || '',
    description: d.descriptions[0] || '',
    description2: d.descriptions[1] || '',
    description3: d.descriptions[2] || '',
    description4: d.descriptions[3] || '',
    description5: d.descriptions[4] || '',
    destinationUrl: d.finalUrl,
    path_1: d.path1,
    path_2: d.path2,
    brandName: d.businessName,
    headline_pins: { values: d.headlines, pins: d.headlinePins },
    description_pins: { values: d.descriptions, pins: d.descriptionPins },
    googleAdSubtype: d.subtype,
  };
  return updates as Partial<CreativeTextAssetRow>;
}

// ---------- Inline preview (per-row mini Google SERP card) ----------

function pickPinned(
  values: string[],
  pins: (number | null)[],
  slot: number,
  used: Set<number>,
): { text: string; index: number } {
  // First: a value explicitly pinned to this slot, not yet consumed
  for (let i = 0; i < values.length; i++) {
    if (pins[i] === slot && values[i] && !used.has(i)) return { text: values[i], index: i };
  }
  // Fallback: first non-empty unpinned value not yet consumed
  for (let i = 0; i < values.length; i++) {
    if (values[i] && pins[i] == null && !used.has(i)) return { text: values[i], index: i };
  }
  // Last resort: any non-empty value not yet consumed (avoid repetition)
  for (let i = 0; i < values.length; i++) {
    if (values[i] && !used.has(i)) return { text: values[i], index: i };
  }
  return { text: '', index: -1 };
}

function buildPreviewHeadline(d: GoogleSearchAdDraft): string {
  const used = new Set<number>();
  const parts: string[] = [];
  for (let slot = 1; slot <= 3; slot++) {
    const { text, index } = pickPinned(d.headlines, d.headlinePins, slot, used);
    if (text) {
      parts.push(text);
      if (index >= 0) used.add(index);
    }
  }
  return parts.join(' | ');
}

function buildPreviewDescription(d: GoogleSearchAdDraft): string {
  const used = new Set<number>();
  const parts: string[] = [];
  for (let slot = 1; slot <= 2; slot++) {
    const { text, index } = pickPinned(d.descriptions, d.descriptionPins, slot, used);
    if (text) {
      parts.push(text);
      if (index >= 0) used.add(index);
    }
  }
  return parts.join(' ');
}

function buildDisplayUrl(d: GoogleSearchAdDraft): string {
  let host = '';
  try { host = new URL(d.finalUrl).host.replace(/^www\./, ''); } catch { host = d.finalUrl || 'example.com'; }
  const segs = [d.path1, d.path2].filter(Boolean);
  return segs.length > 0 ? `${host}/${segs.join('/')}` : host;
}

function GoogleAdPreview({ draft, compact = false }: { draft: GoogleSearchAdDraft; compact?: boolean }) {
  const headline = buildPreviewHeadline(draft) || 'Your headline here';
  const description = buildPreviewDescription(draft) || 'Your description text appears here in Google Search results.';
  const displayUrl = buildDisplayUrl(draft);

  if (compact) {
    return (
      <div className="text-[11px] leading-tight">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="rounded-sm bg-muted px-1 text-[9px] font-semibold">Ad</span>
          <span className="truncate">{displayUrl}</span>
        </div>
        <div className="text-primary font-medium truncate">{headline.slice(0, 90)}</div>
        <div className="text-muted-foreground line-clamp-2">{description.slice(0, 180)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2 shadow-sm">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">Sponsored</span>
        <span className="truncate">{displayUrl}</span>
      </div>
      <div className="text-lg text-primary font-medium leading-snug">{headline}</div>
      <div className="text-sm text-muted-foreground leading-snug">{description}</div>
    </div>
  );
}

// ---------- Pin selector ----------

function PinSelect({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number | null;
  max: number;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value == null ? '_' : `P${value}`}
      onValueChange={(v) => onChange(v === '_' ? null : Number(v.replace('P', '')))}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-14 text-[10px] px-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_">—</SelectItem>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <SelectItem key={n} value={`P${n}`}>P{n}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Editor ----------

export function GoogleSearchTextAssetEditor({
  open,
  onOpenChange,
  rows,
  onRowChange,
  onBulkUpdate,
  onDeleteAssignments,
}: GoogleSearchTextAssetEditorProps) {
  // Internal in-memory drafts so users can edit freely and we sync back on change.
  const [drafts, setDrafts] = useState<GoogleSearchAdDraft[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; assignmentIds: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<GoogleSearchAdDraft | null>(null);
  // Filters: by ad subtype and by validity (mirrors the main editor "Select" UX).
  const [subtypeFilter, setSubtypeFilter] = useState<'all' | GoogleAdSubtype>('all');
  const [validityFilter, setValidityFilter] = useState<'all' | 'invalid' | 'valid'>('all');

  // Filter rows to Google Search and rebuild drafts whenever the dialog opens
  // or upstream rows change.
  const googleRows = useMemo(() => rows.filter(isGoogleSearchRow), [rows]);
  // Hide only the empty structural shell placeholders (synthesized from the
  // campaign tree). Uploaded RSA rows have no assignmentId yet but ARE real
  // user-authored ads — they must remain visible. Real persisted assignments
  // also have no `isShellPlaceholder` flag and stay visible.
  const visibleGoogleRows = useMemo(
    () => googleRows.filter((row) => !(row as any).isShellPlaceholder),
    [googleRows],
  );

  useEffect(() => {
    if (!open) return;
    setDrafts(visibleGoogleRows.map(rowToDraft));
    setFocusedId(visibleGoogleRows[0]?.id ?? null);
    setSelectedIds(new Set());
  }, [open, visibleGoogleRows]);

  // Per-subtype validation. Mirrors Google Ads minimum requirements so that
  // "Invalid" filter surfaces ads the user still needs to finish.
  const isDraftInvalid = useCallback((d: GoogleSearchAdDraft): boolean => {
    const filledHeadlines = d.headlines.filter((h) => h && h.trim()).length;
    const filledDescriptions = d.descriptions.filter((x) => x && x.trim()).length;
    const hasFinalUrl = !!(d.finalUrl && d.finalUrl.trim());
    if (d.subtype === 'rsa') return filledHeadlines < 3 || filledDescriptions < 2 || !hasFinalUrl;
    if (d.subtype === 'sitelink') return filledHeadlines < 1 || !hasFinalUrl;
    // callout
    return filledHeadlines < 1;
  }, []);

  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      if (subtypeFilter !== 'all' && d.subtype !== subtypeFilter) return false;
      if (validityFilter === 'invalid' && !isDraftInvalid(d)) return false;
      if (validityFilter === 'valid' && isDraftInvalid(d)) return false;
      return true;
    });
  }, [drafts, subtypeFilter, validityFilter, isDraftInvalid]);

  const updateDraft = useCallback((rowId: string, patch: Partial<GoogleSearchAdDraft>) => {
    setDrafts((prev) => {
      const next = prev.map((d) => (d.rowId === rowId ? { ...d, ...patch } : d));
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const setHeadline = useCallback((rowId: string, idx: number, value: string) => {
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (d.rowId !== rowId) return d;
        const headlines = d.headlines.slice();
        headlines[idx] = value.slice(0, HEADLINE_MAX);
        return { ...d, headlines };
      });
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const setHeadlinePin = useCallback((rowId: string, idx: number, pin: number | null) => {
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (d.rowId !== rowId) return d;
        const pins = d.headlinePins.slice();
        pins[idx] = pin;
        return { ...d, headlinePins: pins };
      });
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const setDescription = useCallback((rowId: string, idx: number, value: string) => {
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (d.rowId !== rowId) return d;
        const descriptions = d.descriptions.slice();
        descriptions[idx] = value.slice(0, DESCRIPTION_MAX);
        return { ...d, descriptions };
      });
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const setDescriptionPin = useCallback((rowId: string, idx: number, pin: number | null) => {
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (d.rowId !== rowId) return d;
        const pins = d.descriptionPins.slice();
        pins[idx] = pin;
        return { ...d, descriptionPins: pins };
      });
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const toggleSelect = useCallback((rowId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowId); else next.delete(rowId);
      return next;
    });
  }, []);

  const selectAll = useCallback((checked: boolean) => {
    // "Select all" only acts on the visible (filtered) rows so users can
    // bulk-select e.g. just RSAs or just invalid ads.
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredDrafts.map((d) => d.rowId)));
  }, [filteredDrafts]);

  const handleSelectInvalid = useCallback(() => {
    const ids = drafts.filter(isDraftInvalid).map((d) => d.rowId);
    if (ids.length === 0) {
      toast.info('No invalid ads found');
      return;
    }
    setSelectedIds(new Set(ids));
    toast.success(`Selected ${ids.length} invalid ad${ids.length === 1 ? '' : 's'}`);
  }, [drafts, isDraftInvalid]);

  // ----- New Ad creation -----
  // Build the unique list of campaigns and (campaign -> ad groups) pairs from
  // the existing drafts so the user can attach a new ad to any known structure.
  const campaignOptions = useMemo(() => {
    const map = new Map<string, { campaign: string; market: string; adGroups: Set<string> }>();
    for (const row of googleRows) {
      const draft = rowToDraft(row);
      const key = `${draft.campaignName}__${draft.market}`;
      if (!map.has(key)) {
        map.set(key, { campaign: draft.campaignName, market: draft.market, adGroups: new Set() });
      }
      if (draft.adGroupName) map.get(key)!.adGroups.add(draft.adGroupName);
    }
    return Array.from(map.entries()).map(([key, v]) => ({
      key,
      campaign: v.campaign,
      market: v.market,
      adGroups: Array.from(v.adGroups),
    }));
  }, [googleRows]);

  const [newAdOpen, setNewAdOpen] = useState(false);
  const [newAdCampaignKey, setNewAdCampaignKey] = useState<string>('');
  const [newAdGroup, setNewAdGroup] = useState<string>('');
  const [newAdSubtype, setNewAdSubtype] = useState<GoogleAdSubtype>('rsa');

  const newAdCampaign = campaignOptions.find((c) => c.key === newAdCampaignKey);

  const handleCreateNewAd = useCallback(() => {
    if (!newAdCampaign) {
      toast.info('Pick a campaign first');
      return;
    }
    if (!newAdGroup) {
      toast.info('Pick an ad group first');
      return;
    }
    const newId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draft: GoogleSearchAdDraft = {
      rowId: newId,
      assignmentId: '',
      campaignName: newAdCampaign.campaign,
      adGroupName: newAdGroup,
      market: newAdCampaign.market,
      subtype: newAdSubtype,
      headlines: pad([], HEADLINE_COUNT, ''),
      headlinePins: pad([], HEADLINE_COUNT, null),
      descriptions: pad([], DESCRIPTION_COUNT, ''),
      descriptionPins: pad([], DESCRIPTION_COUNT, null),
      path1: '',
      path2: '',
      finalUrl: '',
      businessName: '',
    };
    setDrafts((prev) => [...prev, draft]);
    setFocusedId(newId);
    setNewAdOpen(false);
    setNewAdGroup('');
    toast.success(`New ${SUBTYPE_LABEL[newAdSubtype]} added`);
  }, [newAdCampaign, newAdGroup, newAdSubtype]);


  const handleCopyRow = useCallback((rowId: string) => {
    const d = drafts.find((x) => x.rowId === rowId);
    if (!d) return;
    setClipboard(d);
    toast.success('Ad copied — use "Paste to selected" to apply');
  }, [drafts]);

  const handlePasteToSelected = useCallback(() => {
    if (!clipboard) {
      toast.info('Copy an ad first');
      return;
    }
    if (selectedIds.size === 0) {
      toast.info('Select rows to paste into');
      return;
    }
    const ids = Array.from(selectedIds);
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (!selectedIds.has(d.rowId)) return d;
        return {
          ...d,
          subtype: clipboard.subtype,
          headlines: clipboard.headlines.slice(),
          headlinePins: clipboard.headlinePins.slice(),
          descriptions: clipboard.descriptions.slice(),
          descriptionPins: clipboard.descriptionPins.slice(),
          path1: clipboard.path1,
          path2: clipboard.path2,
          finalUrl: clipboard.finalUrl,
          businessName: clipboard.businessName,
        };
      });
      // Bulk-sync upstream
      const updates = draftToRowUpdates({ ...clipboard, rowId: '', assignmentId: '', campaignName: '', adGroupName: '', market: '' });
      onBulkUpdate(ids, updates);
      return next;
    });
    toast.success(`Applied to ${ids.length} ad${ids.length > 1 ? 's' : ''}`);
  }, [clipboard, selectedIds, onBulkUpdate]);

  const handleApplyToAll = useCallback(() => {
    if (!focusedId) return;
    const source = drafts.find((d) => d.rowId === focusedId);
    if (!source) return;
    const targets = drafts.filter((d) => d.rowId !== focusedId).map((d) => d.rowId);
    if (targets.length === 0) {
      toast.info('No other ads to apply to');
      return;
    }
    setDrafts((prev) => prev.map((d) =>
      d.rowId === focusedId ? d : {
        ...d,
        subtype: source.subtype,
        headlines: source.headlines.slice(),
        headlinePins: source.headlinePins.slice(),
        descriptions: source.descriptions.slice(),
        descriptionPins: source.descriptionPins.slice(),
        path1: source.path1,
        path2: source.path2,
        finalUrl: source.finalUrl,
        businessName: source.businessName,
      },
    ));
    onBulkUpdate(targets, draftToRowUpdates({ ...source, rowId: '', assignmentId: '', campaignName: '', adGroupName: '', market: '' }));
    toast.success(`Applied to ${targets.length} other ad${targets.length > 1 ? 's' : ''}`);
  }, [drafts, focusedId, onBulkUpdate]);

  const requestDeleteSelected = useCallback(() => {
    if (!onDeleteAssignments) return;
    const selected = filteredDrafts.filter((d) => selectedIds.has(d.rowId));
    const assignmentIds = selected.map((d) => d.assignmentId).filter(Boolean);
    if (assignmentIds.length === 0) {
      toast.info('Select rows with saved assignments to delete');
      return;
    }
    setConfirmDelete({ ids: selected.map((d) => d.rowId), assignmentIds });
  }, [filteredDrafts, selectedIds, onDeleteAssignments]);

  const performDelete = useCallback(async () => {
    if (!confirmDelete || !onDeleteAssignments) return;
    setDeleting(true);
    try {
      await onDeleteAssignments(confirmDelete.assignmentIds);
      const removed = new Set(confirmDelete.ids);
      setDrafts((prev) => prev.filter((d) => !removed.has(d.rowId)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        removed.forEach((id) => next.delete(id));
        return next;
      });
      setFocusedId((prev) => (prev && removed.has(prev) ? null : prev));
      toast.success(`Deleted ${confirmDelete.assignmentIds.length} ad${confirmDelete.assignmentIds.length === 1 ? '' : 's'}`);
      setConfirmDelete(null);
    } catch (err) {
      toast.error('Failed to delete', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, onDeleteAssignments]);

  const focusedDraft = drafts.find((d) => d.rowId === focusedId) || drafts[0];
  const visibleSelectedCount = filteredDrafts.filter((d) => selectedIds.has(d.rowId)).length;
  const allChecked = filteredDrafts.length > 0 && visibleSelectedCount === filteredDrafts.length;
  const someChecked = visibleSelectedCount > 0 && !allChecked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Google Search — Text Asset Editor
          </DialogTitle>
          <DialogDescription>
            Author Responsive Search Ads, sitelinks and callouts. Pin slots control where each
            asset appears (P1 / P2 / P3). The preview shows how the ad renders in Google Search.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0 flex-wrap">
          {/* Quick selection — mirrors the "Select" dropdown in the main editor */}
          <Select value="_" onValueChange={(v) => {
            if (v === 'all') setSelectedIds(new Set(filteredDrafts.map((d) => d.rowId)));
            else if (v === 'none') setSelectedIds(new Set());
            else if (v === 'invalid') handleSelectInvalid();
            else if (v === 'rsa' || v === 'sitelink' || v === 'callout') {
              const ids = drafts.filter((d) => d.subtype === v).map((d) => d.rowId);
              setSelectedIds(new Set(ids));
            }
          }}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Visible</SelectItem>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="invalid">Invalid Creatives</SelectItem>
              <SelectItem value="rsa">All Text Ads (RSA)</SelectItem>
              <SelectItem value="sitelink">All Sitelinks</SelectItem>
              <SelectItem value="callout">All Callouts</SelectItem>
            </SelectContent>
          </Select>

          {/* Filter: asset type */}
          <Select value={subtypeFilter} onValueChange={(v) => setSubtypeFilter(v as 'all' | GoogleAdSubtype)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Asset type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All asset types</SelectItem>
              <SelectItem value="rsa">Text Ad (RSA)</SelectItem>
              <SelectItem value="sitelink">Sitelink</SelectItem>
              <SelectItem value="callout">Callout</SelectItem>
            </SelectContent>
          </Select>

          {/* Filter: validity */}
          <Select value={validityFilter} onValueChange={(v) => setValidityFilter(v as 'all' | 'invalid' | 'valid')}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ads</SelectItem>
              <SelectItem value="invalid">Invalid only</SelectItem>
              <SelectItem value="valid">Valid only</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePasteToSelected}
            disabled={!clipboard || selectedIds.size === 0}
            className="h-8"
          >
            <Clipboard className="h-3.5 w-3.5 mr-1.5" />
            Paste to selected ({selectedIds.size})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyToAll}
            disabled={!focusedDraft || drafts.length < 2}
            className="h-8"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Apply focused to all
          </Button>

          {onDeleteAssignments && (
            <Button
              variant="destructive"
              size="sm"
              onClick={requestDeleteSelected}
              disabled={selectedIds.size === 0}
              className="h-8"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete selected ({selectedIds.size})
            </Button>
          )}

          {/* New Ad — pick campaign / ad group / asset type */}
          <Popover open={newAdOpen} onOpenChange={setNewAdOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="h-8"
                disabled={campaignOptions.length === 0}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Ad
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-3 space-y-3" align="start">
              <div className="text-sm font-medium">Add a new ad</div>
              <div className="space-y-1.5">
                <Label className="text-xs">Campaign</Label>
                <Select
                  value={newAdCampaignKey}
                  onValueChange={(v) => { setNewAdCampaignKey(v); setNewAdGroup(''); }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select campaign…" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaignOptions.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.campaign} <span className="text-muted-foreground">· {c.market}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ad group</Label>
                <Select
                  value={newAdGroup}
                  onValueChange={setNewAdGroup}
                  disabled={!newAdCampaign}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={newAdCampaign ? 'Select ad group…' : 'Pick a campaign first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {newAdCampaign?.adGroups.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Asset type</Label>
                <Select value={newAdSubtype} onValueChange={(v) => setNewAdSubtype(v as GoogleAdSubtype)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rsa">{SUBTYPE_LABEL.rsa}</SelectItem>
                    <SelectItem value="sitelink">{SUBTYPE_LABEL.sitelink}</SelectItem>
                    <SelectItem value="callout">{SUBTYPE_LABEL.callout}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="w-full h-8" onClick={handleCreateNewAd}>
                Create ad
              </Button>
            </PopoverContent>
          </Popover>

          <div className="ml-auto text-xs text-muted-foreground">
            Showing {filteredDrafts.length} of {drafts.length} ad{drafts.length === 1 ? '' : 's'} • {selectedIds.size} selected
          </div>
        </div>

        {/* Body: table on left, preview on right */}
        <div className="flex-1 overflow-hidden flex">
          {/* Table — overflow-auto on the wrapper guarantees both axes scroll
              even when the inner table grows wider than the viewport. */}
          <div className="flex-1 overflow-auto border-r">
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content', tableLayout: 'fixed' }}>
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="px-2 py-2 w-8 border-b">
                      <Checkbox
                        checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                        onCheckedChange={(v) => selectAll(!!v)}
                      />
                    </th>
                    <th className="px-2 py-2 text-left border-b min-w-[200px]">Campaign / Ad group</th>
                    <th className="px-2 py-2 text-left border-b min-w-[150px]">Ad type</th>
                    <th className="px-2 py-2 text-left border-b min-w-[280px]">Preview</th>
                    {Array.from({ length: HEADLINE_COUNT }, (_, i) => (
                      // Headlines max 30 chars — give the input enough room to show the full string.
                      <th key={`h${i}`} className="px-1 py-2 text-left border-b min-w-[320px]">H{i + 1}</th>
                    ))}
                    {Array.from({ length: DESCRIPTION_COUNT }, (_, i) => (
                      // Descriptions max 90 chars — wider still so text is readable without scrolling per cell.
                      <th key={`d${i}`} className="px-1 py-2 text-left border-b min-w-[520px]">D{i + 1}</th>
                    ))}
                    <th className="px-1 py-2 text-left border-b min-w-[180px]">Path 1</th>
                    <th className="px-1 py-2 text-left border-b min-w-[180px]">Path 2</th>
                    <th className="px-1 py-2 text-left border-b min-w-[320px]">Final URL</th>
                    
                    <th className="px-1 py-2 w-10 border-b" />
                  </tr>
                </thead>
                <tbody>
                  {drafts.length === 0 && (
                    <tr>
                      <td colSpan={6 + HEADLINE_COUNT + DESCRIPTION_COUNT} className="text-center text-muted-foreground py-12">
                        No Google Search ads yet. Upload a shell or assign creatives first.
                      </td>
                    </tr>
                  )}
                  {filteredDrafts.map((d) => {
                    const isFocused = focusedId === d.rowId;
                    const isChecked = selectedIds.has(d.rowId);
                    return (
                      <tr
                        key={d.rowId}
                        className={cn(
                          'border-b hover:bg-accent/30 cursor-pointer',
                          isFocused && 'bg-primary/5',
                          isChecked && 'bg-primary/10',
                        )}
                        onClick={() => setFocusedId(d.rowId)}
                      >
                        <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(v) => toggleSelect(d.rowId, !!v)}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div className="font-medium truncate" title={d.campaignName}>{d.campaignName}</div>
                          <div className="text-muted-foreground text-[10px] truncate" title={d.adGroupName}>{d.adGroupName}</div>
                          <Badge variant="outline" className="text-[9px] mt-1">{d.market}</Badge>
                        </td>
                        <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={d.subtype}
                            onValueChange={(v) => updateDraft(d.rowId, { subtype: v as GoogleAdSubtype })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rsa">{SUBTYPE_LABEL.rsa}</SelectItem>
                              <SelectItem value="sitelink">{SUBTYPE_LABEL.sitelink}</SelectItem>
                              <SelectItem value="callout">{SUBTYPE_LABEL.callout}</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <GoogleAdPreview draft={d} compact />
                        </td>
                        {Array.from({ length: HEADLINE_COUNT }, (_, i) => (
                          <td key={`h${i}`} className="px-1 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Input
                                value={d.headlines[i] || ''}
                                onChange={(e) => setHeadline(d.rowId, i, e.target.value)}
                                placeholder={i === 0 ? 'Required' : ''}
                                className="h-7 text-xs"
                                maxLength={HEADLINE_MAX}
                              />
                              <PinSelect
                                value={d.headlinePins[i] ?? null}
                                max={3}
                                onChange={(v) => setHeadlinePin(d.rowId, i, v)}
                              />
                            </div>
                            <div className="text-[9px] text-muted-foreground text-right">
                              {(d.headlines[i] || '').length}/{HEADLINE_MAX}
                            </div>
                          </td>
                        ))}
                        {Array.from({ length: DESCRIPTION_COUNT }, (_, i) => (
                          <td key={`d${i}`} className="px-1 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Input
                                value={d.descriptions[i] || ''}
                                onChange={(e) => setDescription(d.rowId, i, e.target.value)}
                                placeholder={i === 0 ? 'Required' : ''}
                                className="h-7 text-xs"
                                maxLength={DESCRIPTION_MAX}
                              />
                              <PinSelect
                                value={d.descriptionPins[i] ?? null}
                                max={2}
                                onChange={(v) => setDescriptionPin(d.rowId, i, v)}
                              />
                            </div>
                            <div className="text-[9px] text-muted-foreground text-right">
                              {(d.descriptions[i] || '').length}/{DESCRIPTION_MAX}
                            </div>
                          </td>
                        ))}
                        <td className="px-1 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={d.path1}
                            onChange={(e) => updateDraft(d.rowId, { path1: e.target.value.slice(0, PATH_MAX) })}
                            className="h-7 text-xs"
                            maxLength={PATH_MAX}
                          />
                        </td>
                        <td className="px-1 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={d.path2}
                            onChange={(e) => updateDraft(d.rowId, { path2: e.target.value.slice(0, PATH_MAX) })}
                            className="h-7 text-xs"
                            maxLength={PATH_MAX}
                          />
                        </td>
                        <td className="px-1 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={d.finalUrl}
                            onChange={(e) => updateDraft(d.rowId, { finalUrl: e.target.value })}
                            placeholder="https://"
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="px-1 py-2 align-top text-center" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleCopyRow(d.rowId)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy this ad</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>

          {/* Side panel preview */}
          <div className="w-[360px] shrink-0 bg-muted/30 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b text-xs font-medium text-muted-foreground">
              Focused ad preview
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {focusedDraft ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">{focusedDraft.campaignName}</div>
                      <div>{focusedDraft.adGroupName} · {focusedDraft.market}</div>
                    </div>
                    <GoogleAdPreview draft={focusedDraft} />
                    <div className="text-[10px] text-muted-foreground italic">
                      The Google ranking system swaps headlines and descriptions in real time.
                      This preview shows the pinned combination — actual delivery may vary.
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-12">
                    Select a row to see its preview.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && !deleting && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.assignmentIds.length ?? 0} ad
              {(confirmDelete?.assignmentIds.length ?? 0) === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the creative assignment{(confirmDelete?.assignmentIds.length ?? 0) === 1 ? '' : 's'} and any text assets attached to {(confirmDelete?.assignmentIds.length ?? 0) === 1 ? 'it' : 'them'}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
