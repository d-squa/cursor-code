// Unified text-asset editor for non-Search Google Ads campaigns.
//
// One dialog adapts its column set, character limits and validation rules
// based on the row's `googleCampaignType`:
//
//   - Performance Max (PMax): 5 H × 30, 5 LH × 90, 5 D × 90, BizName(25)
//   - Demand Gen        : 5 H × 40, 5 D × 90, BizName(25)
//   - Video / YouTube   : 1 H × 15, 1 LH × 90, 1 D × 90
//   - Display           : 5 H × 30, 1 LH × 90, 5 D × 90, BizName(25)
//   - Shopping / App / Other → falls back to Display schema
//
// Mirrors the Search editor's UX (toolbar, row table, inline preview, focused
// detail panel, copy/paste). Persistence flows through the parent's
// `onRowChange` / `onBulkUpdate` callbacks, writing both the flat columns
// (headline, headline2..5, description, description2..5, long_headline_1..5,
// business_name, destinationUrl) and the JSON `*_pins` payloads — so the
// existing save path picks them up unchanged.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Clipboard, LayoutGrid, Trash2 } from 'lucide-react';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

// ---------- Type detection ----------

export type GoogleNonSearchType = 'pmax' | 'demand_gen' | 'video' | 'display' | 'other';

function normalizeGooglePhaseFamily(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const withoutStrategy = trimmed
    .replace(/\s+[•·]\s+(brand|generic|competition)\s*$/i, '')
    .replace(/\s*[-–—]\s*(brand|generic|competition)\s*$/i, '');

  return withoutStrategy
    .replace(/^(?:google ads\s*[—–-]\s*)?(search|video(?:\s*\(youtube\))?|display|demand\s*gen|performance\s*max|pmax|shopping|app\s*promotion|app)\s*[—–:-]\s*/i, '')
    .trim()
    .toLowerCase();
}

export function detectGoogleNonSearchType(row: CreativeTextAssetRow): GoogleNonSearchType | null {
  if ((row.platform || '').toLowerCase() !== 'google') return null;
  const explicitType = String(row.googleCampaignType || '').toLowerCase();
  const fallbackPhase = String(row.phase || '').toLowerCase();
  const type = `${explicitType} ${fallbackPhase}`.trim();
  if (!type) return null;
  if (explicitType.includes('search') || (!explicitType && fallbackPhase.includes('search'))) return null;
  if (type.includes('performance') || type.includes('pmax') || type.includes('p-max')) return 'pmax';
  if (type.includes('demand')) return 'demand_gen';
  if (type.includes('video') || type.includes('youtube')) return 'video';
  if (type.includes('display')) return 'display';
  if (type.includes('shopping') || type.includes('app')) return 'display';
  return 'other';
}

interface SchemaSpec {
  label: string;
  headlineCount: number;
  headlineMax: number;
  longHeadlineCount: number;
  longHeadlineMax: number;
  descriptionCount: number;
  descriptionMax: number;
  hasBusinessName: boolean;
  businessNameMax: number;
  /** Minimums that trigger an "Invalid" badge. */
  minHeadlines: number;
  minLongHeadlines: number;
  minDescriptions: number;
  /** Whether business name is required to be considered valid. */
  requiresBusinessName: boolean;
  requiresFinalUrl: boolean;
  /**
   * If true, this campaign type uploads a YouTube video (or image) as the
   * actual creative — text assets are parameters of that asset. Surfaces a
   * "YouTube Video URL" input and validates that the row carries one.
   */
  requiresYoutubeVideo: boolean;
}

const SCHEMAS: Record<GoogleNonSearchType, SchemaSpec> = {
  pmax: {
    label: 'Performance Max',
    headlineCount: 5, headlineMax: 30,
    longHeadlineCount: 5, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
    hasBusinessName: true, businessNameMax: 25,
    minHeadlines: 3, minLongHeadlines: 1, minDescriptions: 2,
    requiresBusinessName: true, requiresFinalUrl: true,
    requiresYoutubeVideo: false,
  },
  demand_gen: {
    label: 'Demand Gen',
    headlineCount: 5, headlineMax: 40,
    longHeadlineCount: 0, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
    hasBusinessName: true, businessNameMax: 25,
    minHeadlines: 1, minLongHeadlines: 0, minDescriptions: 1,
    requiresBusinessName: true, requiresFinalUrl: true,
    requiresYoutubeVideo: true,
  },
  video: {
    label: 'Video (YouTube)',
    headlineCount: 2, headlineMax: 40,
    longHeadlineCount: 0, longHeadlineMax: 90,
    descriptionCount: 4, descriptionMax: 90,
    hasBusinessName: true, businessNameMax: 25,
    minHeadlines: 1, minLongHeadlines: 0, minDescriptions: 1,
    requiresBusinessName: false, requiresFinalUrl: true,
    requiresYoutubeVideo: true,
  },
  display: {
    label: 'Display',
    headlineCount: 5, headlineMax: 30,
    longHeadlineCount: 5, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
    hasBusinessName: true, businessNameMax: 25,
    minHeadlines: 1, minLongHeadlines: 1, minDescriptions: 1,
    requiresBusinessName: true, requiresFinalUrl: true,
    requiresYoutubeVideo: false,
  },
  other: {
    label: 'Google Ads',
    headlineCount: 5, headlineMax: 30,
    longHeadlineCount: 5, longHeadlineMax: 90,
    descriptionCount: 5, descriptionMax: 90,
    hasBusinessName: true, businessNameMax: 25,
    minHeadlines: 1, minLongHeadlines: 0, minDescriptions: 1,
    requiresBusinessName: false, requiresFinalUrl: true,
    requiresYoutubeVideo: false,
  },
};

// ---------- Draft model ----------

export interface NonSearchAdDraft {
  rowId: string;
  assignmentId: string;
  campaignName: string;
  adGroupName: string;
  market: string;
  type: GoogleNonSearchType;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  finalUrl: string;
  /** YouTube video URL or ID — required for Demand Gen video / Video (YouTube) ads. */
  youtubeVideoUrl: string;
}

function pad<T>(arr: T[] | undefined, length: number, filler: T): T[] {
  const out = (arr || []).slice(0, length);
  while (out.length < length) out.push(filler);
  return out;
}

function readJsonValues(json: unknown): string[] | undefined {
  if (!json) return undefined;
  if (typeof json === 'string') {
    try { return readJsonValues(JSON.parse(json)); } catch { return undefined; }
  }
  if (typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.values)) return (obj.values as unknown[]).map((v) => String(v ?? ''));
  }
  return undefined;
}

function buildTaxonomyCampaign(row: CreativeTextAssetRow): string {
  const raw =
    (row.taxonomyCampaignName && row.taxonomyCampaignName.trim()) ||
    (row.phase && row.phase.trim()) ||
    '';
  if (!raw) return '';
  const platformUpper = (row.platform || 'GOOGLE').toUpperCase();
  const marketUpper = (row.market || '').toUpperCase();
  if (!marketUpper) return raw;
  const alreadyHasTaxonomy = raw.toUpperCase().includes(`_${marketUpper}`);
  return alreadyHasTaxonomy ? raw : `${raw}_${platformUpper}_${marketUpper}`;
}

function rowToDraft(row: CreativeTextAssetRow, type: GoogleNonSearchType): NonSearchAdDraft {
  const r = row as any;
  const schema = SCHEMAS[type];

  // Headlines: flat cols 1..5 + overflow values in headline_pins.values.
  // Prefer non-empty JSON values only where they exist; stale blank payloads
  // should not override freshly imported flat columns.
  const baseHeadlines = [r.headline, r.headline2, r.headline3, r.headline4, r.headline5]
    .map((v) => String(v || ''));
  const headlineOverflow = readJsonValues(r.headline_pins ?? r.headlinePins) || [];
  const mergedHeadlines = Array.from({ length: Math.max(schema.headlineCount, baseHeadlines.length, headlineOverflow.length) }, (_, i) => {
    const overflowValue = String(headlineOverflow[i] || '');
    const baseValue = String(baseHeadlines[i] || '');
    return overflowValue.trim() ? overflowValue : baseValue;
  });
  const headlines = pad(mergedHeadlines, schema.headlineCount, '');

  // Long headlines: long_headline_1..5
  const baseLongHeadlines = [
    r.long_headline_1, r.long_headline_2, r.long_headline_3, r.long_headline_4, r.long_headline_5,
  ].map((v) => String(v || ''));
  const longHeadlines = pad(baseLongHeadlines, schema.longHeadlineCount, '');

  // Descriptions: flat cols 1..5 + overflow. Same merge rule as headlines so
  // empty JSON payloads do not mask visible flat-column content.
  const baseDescriptions = [r.description, r.description2, r.description3, r.description4, r.description5]
    .map((v) => String(v || ''));
  const descOverflow = readJsonValues(r.description_pins ?? r.descriptionPins) || [];
  const mergedDescriptions = Array.from({ length: Math.max(schema.descriptionCount, baseDescriptions.length, descOverflow.length) }, (_, i) => {
    const overflowValue = String(descOverflow[i] || '');
    const baseValue = String(baseDescriptions[i] || '');
    return overflowValue.trim() ? overflowValue : baseValue;
  });
  const descriptions = pad(mergedDescriptions, schema.descriptionCount, '');

  return {
    rowId: row.id,
    assignmentId: row.assignmentId || '',
    campaignName: buildTaxonomyCampaign(row),
    adGroupName:
      (row.taxonomyAdSetName && row.taxonomyAdSetName.trim()) ||
      (row.adSet && row.adSet.trim()) ||
      '',
    market: row.market,
    type,
    headlines,
    longHeadlines,
    descriptions,
    businessName: String(r.business_name || row.brandName || ''),
    finalUrl: String(row.destinationUrl || ''),
    youtubeVideoUrl: String(row.youtubeVideoUrl || ''),
  };
}

function draftToRowUpdates(d: NonSearchAdDraft): Partial<CreativeTextAssetRow> {
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
    long_headline_1: d.longHeadlines[0] || '',
    long_headline_2: d.longHeadlines[1] || '',
    long_headline_3: d.longHeadlines[2] || '',
    long_headline_4: d.longHeadlines[3] || '',
    long_headline_5: d.longHeadlines[4] || '',
    business_name: d.businessName,
    brandName: d.businessName,
    destinationUrl: d.finalUrl,
    youtubeVideoUrl: d.youtubeVideoUrl,
    // Persist full lists too so re-opening the editor restores everything.
    headline_pins: { values: d.headlines, pins: [] as (number | null)[] },
    description_pins: { values: d.descriptions, pins: [] as (number | null)[] },
  };
  return updates as Partial<CreativeTextAssetRow>;
}

// ---------- Validation ----------

/**
 * Extract a YouTube video ID from a watch / shorts / embed URL — or accept a
 * bare 11-character ID. Returns undefined if no ID can be extracted.
 */
export function extractYouTubeId(input?: string | null): string | undefined {
  if (!input) return undefined;
  const s = String(input).trim();
  if (!s) return undefined;
  // Bare ID
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    // /shorts/<id> /embed/<id> /v/<id>
    const idx = parts.findIndex((p) => ['shorts', 'embed', 'v'].includes(p.toLowerCase()));
    if (idx >= 0 && parts[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[idx + 1])) return parts[idx + 1];
    // youtu.be/<id>
    if (u.hostname.includes('youtu.be') && parts[0] && /^[A-Za-z0-9_-]{11}$/.test(parts[0])) return parts[0];
  } catch {
    // not a URL — fall through
  }
  return undefined;
}

function isDraftInvalid(d: NonSearchAdDraft): boolean {
  const schema = SCHEMAS[d.type];
  const filledH = d.headlines.filter((x) => x && x.trim()).length;
  const filledLH = d.longHeadlines.filter((x) => x && x.trim()).length;
  const filledD = d.descriptions.filter((x) => x && x.trim()).length;
  if (filledH < schema.minHeadlines) return true;
  if (filledLH < schema.minLongHeadlines) return true;
  if (filledD < schema.minDescriptions) return true;
  if (schema.requiresBusinessName && !d.businessName.trim()) return true;
  if (schema.requiresFinalUrl && !d.finalUrl.trim()) return true;
  if (schema.requiresYoutubeVideo && !extractYouTubeId(d.youtubeVideoUrl)) return true;
  return false;
}

// ---------- Inline preview ----------

function GoogleNonSearchPreview({ draft, compact = false }: { draft: NonSearchAdDraft; compact?: boolean }) {
  const headline = draft.headlines.find((x) => x?.trim()) || draft.longHeadlines.find((x) => x?.trim()) || 'Your headline here';
  const description = draft.descriptions.find((x) => x?.trim()) || 'Your description appears here';
  let host = '';
  try { host = new URL(draft.finalUrl).host.replace(/^www\./, ''); } catch { host = draft.finalUrl || 'example.com'; }

  if (compact) {
    return (
      <div className="text-[11px] leading-tight">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="rounded-sm bg-muted px-1 text-[9px] font-semibold">Sponsored</span>
          <span className="truncate">{host}</span>
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
        <span className="truncate">{host}</span>
      </div>
      <div className="text-lg text-primary font-medium leading-snug">{headline}</div>
      <div className="text-sm text-muted-foreground leading-snug">{description}</div>
      {draft.businessName && (
        <div className="text-xs text-muted-foreground pt-1 border-t">{draft.businessName}</div>
      )}
    </div>
  );
}

// ---------- Editor ----------

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All rows currently in the editor (filtered to non-Search Google internally). */
  rows: CreativeTextAssetRow[];
  /** Optional scope: only show rows for this market+phase pair. */
  scopeMarket?: string;
  scopePhase?: string;
  onRowChange: (rowId: string, updates: Partial<CreativeTextAssetRow>) => void;
  onBulkUpdate: (rowIds: string[], updates: Partial<CreativeTextAssetRow>) => void;
  /** Delete one or more creative assignments (by assignmentId). */
  onDeleteAssignments?: (assignmentIds: string[]) => void | Promise<void>;
}

export function GoogleNonSearchTextAssetEditor({
  open, onOpenChange, rows, scopeMarket, scopePhase, onRowChange, onBulkUpdate, onDeleteAssignments,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; assignmentIds: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [drafts, setDrafts] = useState<NonSearchAdDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<NonSearchAdDraft | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | GoogleNonSearchType>('all');
  const [validityFilter, setValidityFilter] = useState<'all' | 'invalid' | 'valid'>('all');

  // Filter input rows: must be google, must have a detectable non-Search type,
  // and (optionally) match the scope requested by the caller.
  //
  // Phase-leak guard: when a `scopePhase` is set, the family-normalised phase
  // match (e.g. "Display — Retargeting" → "retargeting") can collide with
  // another phase that shares the same suffix, pulling unrelated empty
  // placeholder assignments into the editor. We keep the loose family match for
  // populated rows (so legitimate strategy splits like "Search · Brand" still
  // appear) but require an EXACT phase match for empty rows. That way the
  // user only sees blank cards for the phase they actually opened.
  const scopedRows = useMemo(() => {
    const targetPhaseRaw = (scopePhase || '').trim();
    const targetPhaseFamily = normalizeGooglePhaseFamily(scopePhase || '');
    return rows.filter((r) => {
      const type = detectGoogleNonSearchType(r);
      if (!type) return false;
      if (scopeMarket && r.market !== scopeMarket) return false;
      if (scopePhase) {
        const rowPhaseRaw = String(r.phase || '').trim();
        const rowFamily = normalizeGooglePhaseFamily(rowPhaseRaw);
        if (rowFamily !== targetPhaseFamily) return false;

        // Family matches but exact phase string differs — only allow if the
        // row carries actual text content. Empty placeholders from sibling
        // phases stay hidden.
        if (rowPhaseRaw && targetPhaseRaw && rowPhaseRaw !== targetPhaseRaw) {
          const r_ = r as any;
          const hasContent = Boolean(
            (r_.headline && String(r_.headline).trim()) ||
            (r_.headline2 && String(r_.headline2).trim()) ||
            (r_.long_headline_1 && String(r_.long_headline_1).trim()) ||
            (r_.description && String(r_.description).trim()) ||
            (r_.description2 && String(r_.description2).trim()) ||
            (r_.business_name && String(r_.business_name).trim()) ||
            (r.brandName && String(r.brandName).trim()) ||
            (r.destinationUrl && String(r.destinationUrl).trim())
          );
          if (!hasContent) return false;
        }
      }
      return true;
    });
  }, [rows, scopeMarket, scopePhase]);

  useEffect(() => {
    if (!open) return;
    const built = scopedRows
      .map((r) => {
        const t = detectGoogleNonSearchType(r);
        return t ? rowToDraft(r, t) : null;
      })
      .filter((d): d is NonSearchAdDraft => d !== null);
    setDrafts(built);
    setFocusedId(built[0]?.rowId ?? null);
    setSelectedIds(new Set());
  }, [open, scopedRows]);

  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (validityFilter === 'invalid' && !isDraftInvalid(d)) return false;
      if (validityFilter === 'valid' && isDraftInvalid(d)) return false;
      return true;
    });
  }, [drafts, typeFilter, validityFilter]);

  const setHeadline = useCallback((rowId: string, idx: number, value: string) => {
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (d.rowId !== rowId) return d;
        const max = SCHEMAS[d.type].headlineMax;
        const headlines = d.headlines.slice();
        headlines[idx] = value.slice(0, max);
        return { ...d, headlines };
      });
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const setLongHeadline = useCallback((rowId: string, idx: number, value: string) => {
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (d.rowId !== rowId) return d;
        const max = SCHEMAS[d.type].longHeadlineMax;
        const longHeadlines = d.longHeadlines.slice();
        longHeadlines[idx] = value.slice(0, max);
        return { ...d, longHeadlines };
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
        const max = SCHEMAS[d.type].descriptionMax;
        const descriptions = d.descriptions.slice();
        descriptions[idx] = value.slice(0, max);
        return { ...d, descriptions };
      });
      const updated = next.find((d) => d.rowId === rowId);
      if (updated) onRowChange(rowId, draftToRowUpdates(updated));
      return next;
    });
  }, [onRowChange]);

  const updateField = useCallback((rowId: string, patch: Partial<NonSearchAdDraft>) => {
    setDrafts((prev) => {
      const next = prev.map((d) => (d.rowId === rowId ? { ...d, ...patch } : d));
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

  const handleCopyRow = useCallback((rowId: string) => {
    const d = drafts.find((x) => x.rowId === rowId);
    if (!d) return;
    setClipboard(d);
    toast.success('Ad copied — use "Paste to selected" to apply');
  }, [drafts]);

  const handlePasteToSelected = useCallback(() => {
    if (!clipboard) { toast.info('Copy an ad first'); return; }
    if (selectedIds.size === 0) { toast.info('Select rows to paste into'); return; }
    const ids = Array.from(selectedIds);
    setDrafts((prev) => {
      const next = prev.map((d) => {
        if (!selectedIds.has(d.rowId)) return d;
        // Adapt to target schema lengths/limits.
        const sch = SCHEMAS[d.type];
        return {
          ...d,
          headlines: pad(clipboard.headlines.map((x) => x.slice(0, sch.headlineMax)), sch.headlineCount, ''),
          longHeadlines: pad(clipboard.longHeadlines.map((x) => x.slice(0, sch.longHeadlineMax)), sch.longHeadlineCount, ''),
          descriptions: pad(clipboard.descriptions.map((x) => x.slice(0, sch.descriptionMax)), sch.descriptionCount, ''),
          businessName: sch.hasBusinessName ? clipboard.businessName.slice(0, sch.businessNameMax) : '',
          finalUrl: clipboard.finalUrl,
          youtubeVideoUrl: sch.requiresYoutubeVideo ? clipboard.youtubeVideoUrl : d.youtubeVideoUrl,
        };
      });
      // Bulk-sync upstream — apply per-row updates so each row gets its
      // adapted payload (different types may produce different lengths).
      next.filter((d) => ids.includes(d.rowId)).forEach((d) => {
        onRowChange(d.rowId, draftToRowUpdates(d));
      });
      return next;
    });
    toast.success(`Applied to ${ids.length} ad${ids.length > 1 ? 's' : ''}`);
  }, [clipboard, selectedIds, onRowChange]);

  const handleSelectInvalid = useCallback(() => {
    const ids = drafts.filter(isDraftInvalid).map((d) => d.rowId);
    if (ids.length === 0) { toast.info('No invalid ads found'); return; }
    setSelectedIds(new Set(ids));
    toast.success(`Selected ${ids.length} invalid ad${ids.length === 1 ? '' : 's'}`);
  }, [drafts]);

  const requestDeleteSelected = useCallback(() => {
    if (!onDeleteAssignments) return;
    const ids = filteredDrafts.filter((d) => selectedIds.has(d.rowId));
    const assignmentIds = ids.map((d) => d.assignmentId).filter(Boolean);
    if (assignmentIds.length === 0) {
      toast.info('Select rows to delete');
      return;
    }
    setConfirmDelete({ ids: ids.map((d) => d.rowId), assignmentIds });
  }, [filteredDrafts, selectedIds, onDeleteAssignments]);

  const requestDeleteOne = useCallback((rowId: string) => {
    if (!onDeleteAssignments) return;
    const d = drafts.find((x) => x.rowId === rowId);
    if (!d || !d.assignmentId) {
      toast.error('No assignment found for this row');
      return;
    }
    setConfirmDelete({ ids: [rowId], assignmentIds: [d.assignmentId] });
  }, [drafts, onDeleteAssignments]);

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
  const focusedSchema = focusedDraft ? SCHEMAS[focusedDraft.type] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Google Ads — Text Asset Editor
            {scopePhase && <Badge variant="secondary">{scopePhase}</Badge>}
            {scopeMarket && <Badge variant="outline">{scopeMarket}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Author headlines, long headlines, descriptions and business names for
            Performance Max, Demand Gen, Video and Display campaigns. Each ad uses
            its own column set and character limits.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0 flex-wrap">
          <Select value="_" onValueChange={(v) => {
            if (v === 'all') setSelectedIds(new Set(filteredDrafts.map((d) => d.rowId)));
            else if (v === 'none') setSelectedIds(new Set());
            else if (v === 'invalid') handleSelectInvalid();
            else if (v === 'pmax' || v === 'demand_gen' || v === 'video' || v === 'display' || v === 'other') {
              setSelectedIds(new Set(drafts.filter((d) => d.type === v).map((d) => d.rowId)));
            }
          }}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Visible</SelectItem>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="invalid">Invalid Creatives</SelectItem>
              <SelectItem value="pmax">All Performance Max</SelectItem>
              <SelectItem value="demand_gen">All Demand Gen</SelectItem>
              <SelectItem value="video">All Video</SelectItem>
              <SelectItem value="display">All Display</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | GoogleNonSearchType)}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Campaign type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaign types</SelectItem>
              <SelectItem value="pmax">Performance Max</SelectItem>
              <SelectItem value="demand_gen">Demand Gen</SelectItem>
              <SelectItem value="video">Video (YouTube)</SelectItem>
              <SelectItem value="display">Display</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={validityFilter} onValueChange={(v) => setValidityFilter(v as 'all' | 'invalid' | 'valid')}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ads</SelectItem>
              <SelectItem value="invalid">Invalid only</SelectItem>
              <SelectItem value="valid">Valid only</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handlePasteToSelected}
            disabled={!clipboard || selectedIds.size === 0} className="h-8">
            <Clipboard className="h-3.5 w-3.5 mr-1.5" />
            Paste to selected ({selectedIds.size})
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

          <div className="ml-auto text-xs text-muted-foreground">
            {drafts.length} ad{drafts.length === 1 ? '' : 's'} · {filteredDrafts.length} shown
          </div>
        </div>

        {/* Body: two-pane layout — table on the left, focused detail on the right */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-hidden border-r">
            <ScrollArea className="h-full">
              <div className="min-w-[1100px]">
                {/* Header */}
                <div className="grid border-b bg-muted/40 text-xs font-medium sticky top-0 z-10"
                     style={{ gridTemplateColumns: '36px 1fr 140px 240px 1fr 1fr 80px' }}>
                  <div className="px-2 py-2 flex items-center justify-center">
                    <Checkbox
                      checked={filteredDrafts.length > 0 && filteredDrafts.every((d) => selectedIds.has(d.rowId))}
                      onCheckedChange={(c) => {
                        if (c) setSelectedIds(new Set(filteredDrafts.map((d) => d.rowId)));
                        else setSelectedIds(new Set());
                      }}
                    />
                  </div>
                  <div className="px-2 py-2">Campaign / Ad group</div>
                  <div className="px-2 py-2">Type</div>
                  <div className="px-2 py-2">Preview</div>
                  <div className="px-2 py-2">Headlines (filled)</div>
                  <div className="px-2 py-2">Descriptions (filled)</div>
                  <div className="px-2 py-2 text-center">Status</div>
                </div>

                {/* Rows */}
                {filteredDrafts.length === 0 ? (
                  <div className="p-12 text-center text-sm text-muted-foreground">
                    No non-Search Google ads in this view.
                  </div>
                ) : filteredDrafts.map((d) => {
                  const sch = SCHEMAS[d.type];
                  const filledH = d.headlines.filter((x) => x.trim()).length;
                  const filledD = d.descriptions.filter((x) => x.trim()).length;
                  const invalid = isDraftInvalid(d);
                  return (
                    <div
                      key={d.rowId}
                      className={cn(
                        'grid border-b text-xs cursor-pointer hover:bg-accent/30',
                        focusedId === d.rowId && 'bg-accent/40',
                      )}
                      style={{ gridTemplateColumns: '36px 1fr 140px 240px 1fr 1fr 80px' }}
                      onClick={() => setFocusedId(d.rowId)}
                    >
                      <div className="px-2 py-2 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(d.rowId)} onCheckedChange={(c) => toggleSelect(d.rowId, !!c)} />
                      </div>
                      <div className="px-2 py-2 min-w-0">
                        <div className="font-medium truncate">{d.campaignName || '—'}</div>
                        <div className="text-muted-foreground truncate">{d.adGroupName || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{d.market}</div>
                      </div>
                      <div className="px-2 py-2"><Badge variant="outline" className="text-[10px]">{sch.label}</Badge></div>
                      <div className="px-2 py-2"><GoogleNonSearchPreview draft={d} compact /></div>
                      <div className="px-2 py-2 text-muted-foreground">{filledH}/{sch.headlineCount}</div>
                      <div className="px-2 py-2 text-muted-foreground">{filledD}/{sch.descriptionCount}</div>
                      <div className="px-2 py-2 text-center">
                        {invalid
                          ? <Badge variant="destructive" className="text-[10px]">Invalid</Badge>
                          : <Badge variant="secondary" className="text-[10px]">OK</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Focused detail */}
          <div className="w-[460px] shrink-0 overflow-hidden flex flex-col">
            {focusedDraft && focusedSchema ? (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Editing</div>
                    <div className="text-sm font-semibold">{focusedDraft.campaignName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{focusedDraft.adGroupName} · {focusedSchema.label}</div>
                  </div>
                  <GoogleNonSearchPreview draft={focusedDraft} />

                  <Section title="Headlines" subtitle={`${focusedSchema.headlineMax} chars max — ${focusedSchema.minHeadlines}+ required`}>
                    {focusedDraft.headlines.map((h, idx) => (
                      <LimitedInput
                        key={idx}
                        value={h}
                        max={focusedSchema.headlineMax}
                        placeholder={`Headline ${idx + 1}`}
                        onChange={(v) => setHeadline(focusedDraft.rowId, idx, v)}
                      />
                    ))}
                  </Section>

                  {focusedSchema.longHeadlineCount > 0 && (
                    <Section title="Long headlines" subtitle={`${focusedSchema.longHeadlineMax} chars max${focusedSchema.minLongHeadlines ? ` — ${focusedSchema.minLongHeadlines}+ required` : ''}`}>
                      {focusedDraft.longHeadlines.map((h, idx) => (
                        <LimitedInput
                          key={idx}
                          value={h}
                          max={focusedSchema.longHeadlineMax}
                          placeholder={`Long headline ${idx + 1}`}
                          multiline
                          onChange={(v) => setLongHeadline(focusedDraft.rowId, idx, v)}
                        />
                      ))}
                    </Section>
                  )}

                  <Section title="Descriptions" subtitle={`${focusedSchema.descriptionMax} chars max — ${focusedSchema.minDescriptions}+ required`}>
                    {focusedDraft.descriptions.map((d, idx) => (
                      <LimitedInput
                        key={idx}
                        value={d}
                        max={focusedSchema.descriptionMax}
                        placeholder={`Description ${idx + 1}`}
                        multiline
                        onChange={(v) => setDescription(focusedDraft.rowId, idx, v)}
                      />
                    ))}
                  </Section>

                  {focusedSchema.hasBusinessName && (
                    <Section title="Business name" subtitle={`${focusedSchema.businessNameMax} chars max${focusedSchema.requiresBusinessName ? ' — required' : ''}`}>
                      <LimitedInput
                        value={focusedDraft.businessName}
                        max={focusedSchema.businessNameMax}
                        placeholder="Brand or business name"
                        onChange={(v) => updateField(focusedDraft.rowId, { businessName: v.slice(0, focusedSchema.businessNameMax) })}
                      />
                    </Section>
                  )}

                  <Section title="Final URL" subtitle={focusedSchema.requiresFinalUrl ? 'required' : 'optional'}>
                    <LimitedInput
                      value={focusedDraft.finalUrl}
                      max={2048}
                      placeholder="https://example.com/landing"
                      onChange={(v) => updateField(focusedDraft.rowId, { finalUrl: v })}
                    />
                  </Section>

                  {focusedSchema.requiresYoutubeVideo && (
                    <Section
                      title="YouTube Video"
                      subtitle={
                        focusedDraft.youtubeVideoUrl && !extractYouTubeId(focusedDraft.youtubeVideoUrl)
                          ? 'invalid YouTube URL — required'
                          : 'required — paste a YouTube watch / shorts / embed URL or 11-char ID'
                      }
                    >
                      <LimitedInput
                        value={focusedDraft.youtubeVideoUrl}
                        max={2048}
                        placeholder="https://www.youtube.com/watch?v=…"
                        onChange={(v) => updateField(focusedDraft.rowId, { youtubeVideoUrl: v })}
                      />
                      {extractYouTubeId(focusedDraft.youtubeVideoUrl) && (
                        <div className="text-[10px] text-muted-foreground">
                          Detected video ID: <span className="font-mono">{extractYouTubeId(focusedDraft.youtubeVideoUrl)}</span>
                        </div>
                      )}
                    </Section>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => handleCopyRow(focusedDraft.rowId)}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy this ad
                    </Button>
                    {onDeleteAssignments && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => requestDeleteOne(focusedDraft.rowId)}
                        className="ml-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
                Select an ad on the left to edit its assets.
              </div>
            )}
          </div>
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

// ---------- Small helpers ----------

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function LimitedInput({
  value, max, placeholder, multiline, onChange,
}: { value: string; max: number; placeholder?: string; multiline?: boolean; onChange: (v: string) => void }) {
  const len = value?.length || 0;
  const over = len > max;
  return (
    <div className="relative">
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          rows={2}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          className={cn(
            'w-full rounded-md border bg-background px-2 py-1.5 text-xs resize-y min-h-[40px]',
            over && 'border-destructive',
          )}
        />
      ) : (
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          className={cn('h-8 text-xs', over && 'border-destructive')}
        />
      )}
      <div className={cn('text-[10px] text-right pt-0.5', over ? 'text-destructive' : 'text-muted-foreground')}>
        {len}/{max}
      </div>
    </div>
  );
}
