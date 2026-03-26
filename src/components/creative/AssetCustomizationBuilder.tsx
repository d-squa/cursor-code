// Asset Customization Builder Dialog
// Allows users to detect, create, edit, and manage asset customization groups
// Supports Placement, Language, and Flexible Creative customization types

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutGrid,
  Globe,
  Sparkles,
  Wand2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Image,
  Video,
  ArrowRight,
  Unlink,
  Eye,
  ChevronDown,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet,
  FileJson,
  Copy,
  ClipboardPaste,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import { PLATFORM_TEXT_FIELDS, PLATFORM_CTAS } from '@/types/creativeTextAssets';
import {
  type DetectedACGroup,
  type CustomizationType,
  type DeliveryBucket,
  detectAssetCustomizationGroups,
  validateACSelection,
  classifyDeliveryBucket,
  detectLanguage,
  DELIVERY_BUCKETS,
  SUPPORTED_LANGUAGES,
} from '@/utils/assetCustomizationEngine';
import { compileAssetFeedSpec, type CompilationResult } from '@/utils/assetFeedSpecCompiler';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetCustomizationBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CreativeTextAssetRow[];
  selectedRowIds: Set<string>;
  platform: string;
  campaignId?: string;
  /** If set, skip type selection and go straight to this mode */
  forcedType?: CustomizationType;
  onCreateGroup: (group: DetectedACGroup, compiledSpec: CompilationResult) => void;
  onUngroupRows: (rowIds: string[]) => void;
}

const TYPE_ICONS: Record<CustomizationType, React.ReactNode> = {
  placement: <Monitor className="h-4 w-4" />,
  language: <Globe className="h-4 w-4" />,
  flexible_creative: <Sparkles className="h-4 w-4" />,
};

const TYPE_LABELS: Record<CustomizationType, string> = {
  placement: 'Placement Customization',
  language: 'Language Customization',
  flexible_creative: 'Flexible Creative',
};

const TYPE_DESCRIPTIONS: Record<CustomizationType, string> = {
  placement: 'Different creative dimensions per placement (e.g. 9:16 for Stories, 1:1 for Feed). Text stays the same.',
  language: 'Same creative, different text per language. The system swaps text based on the user\'s language.',
  flexible_creative: 'Pool of creatives + text options. Meta AI mixes and matches for best performance.',
};

const TYPE_COLORS: Record<CustomizationType, string> = {
  placement: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  language: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  flexible_creative: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
};

const BUCKET_ICONS: Record<DeliveryBucket, React.ReactNode> = {
  square: <Tablet className="h-3.5 w-3.5" />,
  fullscreen_vertical: <Smartphone className="h-3.5 w-3.5" />,
  horizontal: <Monitor className="h-3.5 w-3.5" />,
  vertical: <Smartphone className="h-3.5 w-3.5" />,
  other: <Image className="h-3.5 w-3.5" />,
};

// ─── Type Selector Step ──────────────────────────────────────────────────────

function TypeSelector({
  onSelect,
}: {
  onSelect: (type: CustomizationType) => void;
}) {
  const types: CustomizationType[] = ['placement', 'language', 'flexible_creative'];

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        Choose the type of asset customization to create:
      </p>
      <div className="space-y-3">
        {types.map(type => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={cn(
              'w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors',
              'hover:border-primary hover:bg-primary/5',
            )}
          >
            <div className={cn('p-2 rounded-md mt-0.5 shrink-0', TYPE_COLORS[type])}>
              {TYPE_ICONS[type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{TYPE_LABELS[type]}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {TYPE_DESCRIPTIONS[type]}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Language Text Inputs via Bulk Excel Paste ──────────────────────────────

const LANG_PASTE_COLUMNS = ['Market/Language', 'Primary Text', 'Headline', 'Description', 'CTA', 'Destination URL'];
const LANG_FIELD_KEYS = ['language', 'primaryText', 'headline', 'description', 'callToAction', 'destinationUrl'] as const;

const META_CTAS = PLATFORM_CTAS.meta;

/** Normalize a pasted CTA value to match the META_CTAS enum format */
function normalizeCTA(input: string): string {
  if (!input) return '';
  // Normalize: trim, uppercase, replace spaces/hyphens with underscores
  const normalized = input.trim().toUpperCase().replace(/[\s-]+/g, '_');
  // Direct match
  if (META_CTAS.includes(normalized as any)) return normalized;
  // Try without underscores (e.g. "LearnMore" -> "LEARN_MORE" won't match directly,
  // but "Learn_More" -> "LEARN_MORE" will via the uppercase above)
  // Also try matching by removing all underscores and comparing
  const stripped = normalized.replace(/_/g, '');
  const found = META_CTAS.find(cta => cta.replace(/_/g, '') === stripped);
  if (found) return found;
  // Return original trimmed value as fallback
  return input.trim();
}

interface ParsedLangRow {
  language: string;
  languageCode: string;
  primaryText: string;
  headline: string;
  description: string;
  destinationUrl: string;
  callToAction: string;
}

// Country/market aliases → language code
const COUNTRY_LANG_MAP: Record<string, string> = {
  uae: 'ar', ksa: 'ar', qatar: 'ar', bahrain: 'ar', oman: 'ar', kuwait: 'ar', egypt: 'ar', jordan: 'ar', lebanon: 'ar', iraq: 'ar',
  us: 'en', usa: 'en', uk: 'en', canada: 'en', australia: 'en', 'united states': 'en', 'united kingdom': 'en',
  germany: 'de', deutschland: 'de',
  france: 'fr',
  spain: 'es', españa: 'es',
  italy: 'it', italia: 'it',
  portugal: 'pt', brazil: 'pt', brasil: 'pt',
  netherlands: 'nl', holland: 'nl',
  turkey: 'tr', türkiye: 'tr',
  russia: 'ru',
  japan: 'ja',
  korea: 'ko', 'south korea': 'ko',
  china: 'zh',
  india: 'hi',
};

function resolveLanguageCode(input: string): string | null {
  const cleaned = input.trim().toLowerCase();
  // Direct code match
  const direct = SUPPORTED_LANGUAGES.find(l => l.code === cleaned);
  if (direct) return direct.code;
  // Label match
  const byLabel = SUPPORTED_LANGUAGES.find(l => l.label.toLowerCase() === cleaned);
  if (byLabel) return byLabel.code;
  // Country/market match
  if (COUNTRY_LANG_MAP[cleaned]) return COUNTRY_LANG_MAP[cleaned];
  // Partial match
  const partial = SUPPORTED_LANGUAGES.find(l =>
    l.label.toLowerCase().startsWith(cleaned) || cleaned.startsWith(l.code)
  );
  if (partial) return partial.code;
  return null;
}

/** Build a regex that matches any known language/country token as a word boundary */
function buildLangTokenRegex(): RegExp {
  const allTokens: string[] = [];
  for (const l of SUPPORTED_LANGUAGES) {
    allTokens.push(l.label);
    allTokens.push(l.code.toUpperCase());
  }
  for (const key of Object.keys(COUNTRY_LANG_MAP)) {
    allTokens.push(key);
  }
  // Sort longest first to avoid partial matches
  allTokens.sort((a, b) => b.length - a.length);
  const escaped = allTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:^|[\\s,;])(?=${escaped.join('|')})`, 'gi');
}

/**
 * Parse bulk pasted text that may not have tabs or newlines.
 * Splits on known language/country tokens, then splits each segment into fields.
 */
function parseBulkPaste(text: string): Array<{ lang: string; fields: string[] }> {
  const allTokens: string[] = [];
  for (const l of SUPPORTED_LANGUAGES) {
    allTokens.push(l.label.toLowerCase());
    allTokens.push(l.code.toLowerCase());
  }
  for (const key of Object.keys(COUNTRY_LANG_MAP)) {
    allTokens.push(key.toLowerCase());
  }
  allTokens.sort((a, b) => b.length - a.length);

  // Find positions of all language tokens in the text
  const lower = text.toLowerCase();
  const segments: Array<{ token: string; start: number }> = [];

  for (const token of allTokens) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(token, searchFrom);
      if (idx === -1) break;
      // Must be at start or preceded by whitespace/comma
      const before = idx === 0 || /[\s,;]/.test(lower[idx - 1]);
      // Must be followed by whitespace or end
      const afterIdx = idx + token.length;
      const after = afterIdx >= lower.length || /[\s,;\t]/.test(lower[afterIdx]);
      if (before && after) {
        // Avoid duplicates at same position
        if (!segments.some(s => Math.abs(s.start - idx) < 3)) {
          segments.push({ token, start: idx });
        }
      }
      searchFrom = idx + token.length;
    }
  }

  segments.sort((a, b) => a.start - b.start);
  if (segments.length === 0) return [];

  const results: Array<{ lang: string; fields: string[] }> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const langCode = resolveLanguageCode(seg.token);
    if (!langCode) continue;
    const contentStart = seg.start + seg.token.length;
    const contentEnd = i + 1 < segments.length ? segments[i + 1].start : text.length;
    const content = text.substring(contentStart, contentEnd).trim();
    // Split content by tabs first, then by 2+ spaces if no tabs
    const fields = content.includes('\t')
      ? content.split('\t').map(f => f.trim()).filter(Boolean)
      : content.split(/\s{2,}/).map(f => f.trim()).filter(Boolean);
    results.push({ lang: langCode, fields });
  }
  return results;
}

function LanguageTextInputs({
  languageTexts,
  onLanguageTextsChange,
  defaultLanguage,
  onDefaultLanguageChange,
}: {
  languageTexts: Map<string, Record<string, string>>;
  onLanguageTextsChange: (texts: Map<string, Record<string, string>>) => void;
  defaultLanguage?: string;
  onDefaultLanguageChange?: (lang: string) => void;
}) {
  const [pasteValue, setPasteValue] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingLang, setEditingLang] = useState<string | null>(null);

  const detectedLanguages = useMemo(() => {
    return [...languageTexts.keys()].sort();
  }, [languageTexts]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted) return;

    e.preventDefault();
    setParseError(null);

    const next = new Map(languageTexts);
    const errors: string[] = [];
    let parsed = 0;

    // Try tab-separated lines first (standard Excel paste)
    const lines = pasted.split('\n').map(l => l.trim()).filter(Boolean);
    const tsvLines = lines.filter(l => l.includes('\t'));

    if (tsvLines.length > 0) {
      for (const line of tsvLines) {
        const cols = line.split('\t').map(c => c.trim());
        if (cols.length < 2) continue;

        const langInput = cols[0];
        const langCode = resolveLanguageCode(langInput);
        if (!langCode) {
          errors.push(`Unknown language/market: "${langInput}"`);
          continue;
        }

        const row: Record<string, string> = {};
        if (cols[1]) row.primaryText = cols[1];
        if (cols[2]) row.headline = cols[2];
        if (cols[3]) row.description = cols[3];
        if (cols[4]) row.callToAction = normalizeCTA(cols[4]);
        if (cols[5]) row.destinationUrl = cols[5];

        const existing = next.get(langCode) || {};
        next.set(langCode, { ...existing, ...row });
        parsed++;
      }
    } else {
      // Fallback: bulk paste without tabs — split by language/country tokens
      const bulkRows = parseBulkPaste(pasted);
      for (const { lang, fields } of bulkRows) {
        const row: Record<string, string> = {};
        if (fields[0]) row.primaryText = fields[0];
        if (fields[1]) row.headline = fields[1];
        if (fields[2]) row.description = fields[2];
        if (fields[3]) row.callToAction = normalizeCTA(fields[3]);
        if (fields[4]) row.destinationUrl = fields[4];

        const existing = next.get(lang) || {};
        next.set(lang, { ...existing, ...row });
        parsed++;
      }
      if (bulkRows.length === 0) {
        errors.push('No language/market tokens found in pasted text');
      }
    }

    onLanguageTextsChange(next);
    setPasteValue('');

    if (parsed > 0) {
      toast.success(`Parsed ${parsed} language row(s)`);
    }
    if (errors.length > 0) {
      setParseError(errors.join('; '));
    }

    // Auto-set default language if not set
    if (!defaultLanguage && next.size > 0 && onDefaultLanguageChange) {
      onDefaultLanguageChange([...next.keys()][0]);
    }
  }, [languageTexts, onLanguageTextsChange, defaultLanguage, onDefaultLanguageChange]);

  const handleFieldChange = useCallback((lang: string, fieldId: string, value: string) => {
    const current = { ...(languageTexts.get(lang) || {}) };
    current[fieldId] = value;
    const next = new Map(languageTexts);
    next.set(lang, current);
    onLanguageTextsChange(next);
  }, [languageTexts, onLanguageTextsChange]);

  const handleRemoveLanguage = useCallback((lang: string) => {
    const next = new Map(languageTexts);
    next.delete(lang);
    onLanguageTextsChange(next);
    if (editingLang === lang) setEditingLang(null);
    if (defaultLanguage === lang && next.size > 0 && onDefaultLanguageChange) {
      onDefaultLanguageChange([...next.keys()][0]);
    }
  }, [languageTexts, onLanguageTextsChange, editingLang, defaultLanguage, onDefaultLanguageChange]);

  return (
    <div className="space-y-3 mt-3">
      {/* Paste area */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Paste from Excel</span>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ClipboardPaste className="h-3 w-3" />
            Columns: {LANG_PASTE_COLUMNS.join(' | ')}
          </div>
        </div>
        <Textarea
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          onPaste={handlePaste}
          placeholder={`Paste bulk data here (tabs or plain text)...\ne.g.: UAE Primary Text1 Caption 1 Learn_More https://example.com KSA نص أساسي عنوان Learn_More https://example.com/ar\n\nOr tab-separated rows from Excel:\nUAE\tPrimary Text\tHeadline\tLearn_More\thttps://example.com`}
          className="text-xs min-h-[80px] resize-none font-mono"
        />
        {parseError && (
          <p className="text-[10px] text-destructive">{parseError}</p>
        )}
      </div>

      {/* Detected languages table */}
      {detectedLanguages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {detectedLanguages.length} language(s) detected
            </span>
            {detectedLanguages.length >= 2 && onDefaultLanguageChange && (
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground">Default:</Label>
                <Select value={defaultLanguage || detectedLanguages[0]} onValueChange={onDefaultLanguageChange}>
                  <SelectTrigger className="h-6 w-28 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {detectedLanguages.map(l => (
                      <SelectItem key={l} value={l} className="text-xs">
                        {SUPPORTED_LANGUAGES.find(sl => sl.code === l)?.label || l.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="border rounded-md divide-y">
            {detectedLanguages.map(lang => {
              const texts = languageTexts.get(lang) || {};
              const langLabel = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.label || lang.toUpperCase();
              const isEditing = editingLang === lang;
              const filledCount = Object.values(texts).filter(v => v && v.length > 0).length;

              return (
                <div key={lang} className="text-xs">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button onClick={() => setEditingLang(isEditing ? null : lang)} className="p-0.5 hover:bg-muted rounded">
                      {isEditing ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    <Badge variant={lang === defaultLanguage ? 'default' : 'secondary'} className="text-[10px] h-5">
                      {langLabel}
                    </Badge>
                    <span className="text-muted-foreground flex-1 truncate">
                      {texts.headline || texts.primaryText || '(no text yet)'}
                    </span>
                    <Badge variant="outline" className="text-[9px] h-4">{filledCount} fields</Badge>
                    <button
                      onClick={() => handleRemoveLanguage(lang)}
                      className="p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                    >
                      <XCircle className="h-3 w-3" />
                    </button>
                  </div>

                  {isEditing && (
                    <div className="px-3 pb-3 space-y-2 bg-muted/20">
                      {[
                        { id: 'primaryText', label: 'Primary Text', multiline: true },
                        { id: 'headline', label: 'Headline' },
                        { id: 'description', label: 'Description' },
                        { id: 'destinationUrl', label: 'Destination URL' },
                      ].map(field => (
                        <div key={field.id} className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
                          {field.multiline ? (
                            <Textarea
                              value={texts[field.id] || ''}
                              onChange={(e) => handleFieldChange(lang, field.id, e.target.value)}
                              className="text-xs min-h-[50px] resize-none"
                              placeholder={`${field.label}...`}
                            />
                          ) : (
                            <Input
                              value={texts[field.id] || ''}
                              onChange={(e) => handleFieldChange(lang, field.id, e.target.value)}
                              className="h-7 text-xs"
                              placeholder={`${field.label}...`}
                            />
                          )}
                        </div>
                      ))}
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Call to Action</Label>
                        <Select
                          value={texts.callToAction || ''}
                          onValueChange={(val) => handleFieldChange(lang, 'callToAction', val)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select CTA..." />
                          </SelectTrigger>
                          <SelectContent>
                            {META_CTAS.map(cta => (
                              <SelectItem key={cta} value={cta} className="text-xs">
                                {cta.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {detectedLanguages.length < 2 && (
            <Alert className="py-2">
              <AlertDescription className="text-[10px]">
                Paste at least 2 language rows to enable language customization.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function DetectedGroupCard({
  group,
  isSelected,
  onToggle,
  expanded,
  onToggleExpand,
  groupDefaultLanguage,
  onDefaultLanguageChange,
  onApplyToAll,
  totalLanguageGroups,
  languageTexts,
  onLanguageTextsChange,
}: {
  group: DetectedACGroup;
  isSelected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  groupDefaultLanguage?: string;
  onDefaultLanguageChange?: (lang: string) => void;
  onApplyToAll?: () => void;
  totalLanguageGroups?: number;
  languageTexts?: Map<string, Record<string, string>>;
  onLanguageTextsChange?: (texts: Map<string, Record<string, string>>) => void;
}) {
  const isLanguageGroup = group.type === 'language';
  const langCount = languageTexts ? [...languageTexts.keys()].length : 0;
  const hasLanguages = isLanguageGroup && langCount >= 2;
  const hasErrors = group.validationErrors.length > 0;
  const languageIncomplete = isLanguageGroup && langCount < 2;

  return (
    <div className={cn(
      'border rounded-lg transition-colors',
      isSelected && !hasErrors && !languageIncomplete ? 'border-primary bg-primary/5' : '',
      hasErrors ? 'border-destructive/50 bg-destructive/5' : '',
    )}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          disabled={hasErrors || languageIncomplete}
        />
        <button
          onClick={onToggleExpand}
          className="p-0.5 hover:bg-muted rounded"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className={cn('p-1.5 rounded-md', TYPE_COLORS[group.type])}>
          {TYPE_ICONS[group.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{group.label}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {group.rows.length} assets
            </Badge>
            {hasLanguages && (
              <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] shrink-0">
                {langCount} langs
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{group.description}</p>
        </div>
        {hasErrors && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <ul className="text-xs space-y-1">
                  {group.validationErrors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {group.type === 'placement' && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Delivery Buckets</span>
              {[...group.deliveryBuckets.entries()].filter(([b]) => b !== 'other').map(([bucket, rows]) => (
                <div key={bucket} className="flex items-center gap-2 pl-2">
                  {BUCKET_ICONS[bucket]}
                  <span className="text-xs">{DELIVERY_BUCKETS[bucket].label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">
                    {rows.map(r => r.creativeName).join(', ')}
                  </span>
                  {rows.length > 1 && (
                    <Badge variant="destructive" className="text-[9px] h-4">
                      {rows.length} (max 1)
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {isLanguageGroup && languageTexts && onLanguageTextsChange && (
            <div className="space-y-3">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Language Text Assets</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Paste rows from Excel with columns: Language, Primary Text, Headline, Description, URL, CTA. Languages are auto-detected.
                </p>
              </div>

              <LanguageTextInputs
                languageTexts={languageTexts}
                onLanguageTextsChange={onLanguageTextsChange}
                defaultLanguage={groupDefaultLanguage}
                onDefaultLanguageChange={onDefaultLanguageChange}
              />

              {onApplyToAll && totalLanguageGroups && totalLanguageGroups > 1 && [...languageTexts.keys()].length >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5"
                  onClick={onApplyToAll}
                >
                  <Globe className="h-3 w-3" />
                  Apply text assets to all {totalLanguageGroups} language groups
                </Button>
              )}
            </div>
          )}

          {group.type === 'flexible_creative' && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Asset Variations</span>
              {group.rows.map((row) => (
                <div key={row.id} className="flex items-center gap-2 pl-2 text-xs">
                  {row.mediaType === 'video' ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                  <span className="truncate">{row.creativeName}</span>
                  {row.aspectRatio && (
                    <Badge variant="outline" className="text-[9px] h-4">{row.aspectRatio}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasErrors && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs">
                {group.validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual Language Assignment Panel ────────────────────────────────────────

function LanguageAssignmentPanel({
  rows,
  languageAssignments,
  onAssignLanguage,
  defaultLanguage,
  onDefaultLanguageChange,
}: {
  rows: CreativeTextAssetRow[];
  languageAssignments: Map<string, string>;
  onAssignLanguage: (rowId: string, lang: string) => void;
  defaultLanguage: string;
  onDefaultLanguageChange: (lang: string) => void;
}) {
  const assignedLangs = useMemo(() => {
    const langs = new Set<string>();
    for (const lang of languageAssignments.values()) {
      if (lang) langs.add(lang);
    }
    return langs;
  }, [languageAssignments]);

  const allAssigned = rows.every(r => languageAssignments.get(r.id));
  const uniqueLangs = assignedLangs.size;
  const hasEnoughLangs = uniqueLangs >= 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">Assign Languages</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Assign a language to each creative. The creative (image/video) stays the same — text is swapped per language.
          </p>
        </div>
        {allAssigned && hasEnoughLangs && (
          <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {uniqueLangs} languages
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {rows.map(row => {
          const autoDetected = detectLanguage(row);
          const assigned = languageAssignments.get(row.id) || '';

          return (
            <div key={row.id} className="flex items-center gap-3 p-2 border rounded-md">
              {row.mediaType === 'video' ? <Video className="h-4 w-4 text-muted-foreground shrink-0" /> : <Image className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="text-xs truncate block">{row.creativeName}</span>
                {row.aspectRatio && (
                  <span className="text-[10px] text-muted-foreground">{row.aspectRatio}</span>
                )}
              </div>
              <Select
                value={assigned}
                onValueChange={(val) => onAssignLanguage(row.id, val)}
              >
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code} className="text-xs">
                      {l.label} ({l.code.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autoDetected && !assigned && (
                <Badge variant="outline" className="text-[9px] h-5 shrink-0 cursor-pointer"
                  onClick={() => onAssignLanguage(row.id, autoDetected)}
                >
                  Auto: {autoDetected.toUpperCase()}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {!allAssigned && (
        <Alert className="py-2">
          <AlertDescription className="text-xs">
            Assign a language to every creative to proceed.
          </AlertDescription>
        </Alert>
      )}

      {allAssigned && !hasEnoughLangs && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">
            At least 2 distinct languages are required for language customization.
          </AlertDescription>
        </Alert>
      )}

      {allAssigned && hasEnoughLangs && (
        <div className="flex items-center gap-3">
          <Label className="text-xs shrink-0">Default Language</Label>
          <Select value={defaultLanguage} onValueChange={onDefaultLanguageChange}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...assignedLangs].map(l => (
                <SelectItem key={l} value={l} className="text-xs">
                  {SUPPORTED_LANGUAGES.find(sl => sl.code === l)?.label || l.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function SpecPreviewPanel({ spec }: { spec: CompilationResult | null }) {
  if (!spec) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileJson className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Compiled asset_feed_spec Preview</span>
        {spec.success ? (
          <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            <XCircle className="h-3 w-3 mr-1" />
            Errors
          </Badge>
        )}
      </div>

      {spec.warnings.length > 0 && (
        <Alert className="py-2">
          <AlertDescription className="text-xs">
            {spec.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {spec.errors.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">
            {spec.errors.map((e, i) => <div key={i}>• {e}</div>)}
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="h-[250px] border rounded-md bg-muted/30">
        <pre className="p-3 text-[11px] font-mono text-foreground whitespace-pre-wrap">
          {JSON.stringify(spec.spec, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AssetCustomizationBuilder({
  open,
  onOpenChange,
  rows,
  selectedRowIds,
  platform,
  campaignId,
  forcedType,
  onCreateGroup,
  onUngroupRows,
}: AssetCustomizationBuilderProps) {
  const [tab, setTab] = useState<'detect' | 'manual'>('detect');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState<string>('en');

  // Default language per detected group
  // Default language per detected group
  const [groupDefaultLanguages, setGroupDefaultLanguages] = useState<Map<string, string>>(new Map());
  // Text assets per language per group (groupId -> langCode -> { primaryText, headline, ... })
  const [groupLanguageTexts, setGroupLanguageTexts] = useState<Map<string, Map<string, Record<string, string>>>>(new Map());

  // Manual mode state
  const [manualType, setManualType] = useState<CustomizationType | null>(forcedType || null);
  const [languageAssignments, setLanguageAssignments] = useState<Map<string, string>>(new Map());
  const [manualLanguageTexts, setManualLanguageTexts] = useState<Map<string, Record<string, string>>>(new Map());

  // Determine if we're in manual mode (user selected creatives before opening)
  const isManualMode = selectedRowIds.size >= 2;

  // Reset state when dialog opens
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      setManualType(forcedType || null);
      setLanguageAssignments(new Map());
      setSelectedGroupIds(new Set());
      setExpandedGroupIds(new Set());
      setPreviewGroupId(null);
      setGroupDefaultLanguages(new Map());
      setGroupLanguageTexts(new Map());
      if (selectedRowIds.size >= 2) {
        setTab('manual');
      } else {
        setTab('detect');
      }
    }
    onOpenChange(open);
  }, [onOpenChange, selectedRowIds.size, forcedType]);

  // Filter to eligible rows for detection
  const eligibleRows = useMemo(() => {
    return rows.filter(r =>
      r.platform.toLowerCase() === 'meta' &&
      !(r as any).isOrganic &&
      !r.carouselGroupId
    );
  }, [rows]);

  // Selected rows for manual mode
  const manualRows = useMemo(() => {
    return rows.filter(r => selectedRowIds.has(r.id));
  }, [rows, selectedRowIds]);

  // Run detection
  const detectedGroups = useMemo(() => {
    return detectAssetCustomizationGroups(eligibleRows, platform);
  }, [eligibleRows, platform]);

  // Compile preview for detected groups
  const previewSpec = useMemo(() => {
    if (!previewGroupId) return null;
    const group = detectedGroups.find(g => g.id === previewGroupId);
    if (!group) return null;
    return compileAssetFeedSpec(group, { defaultLanguage });
  }, [previewGroupId, detectedGroups, defaultLanguage]);

  // Build manual group based on selected type
  const manualGroup = useMemo<DetectedACGroup | null>(() => {
    if (!manualType || manualRows.length < 2) return null;

    const validation = validateACSelection(manualRows, manualType);
    if (!validation.type) return null;

    const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
    const languageMap = new Map<string, CreativeTextAssetRow[]>();

    for (const row of manualRows) {
      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
      bucketMap.get(bucket)!.push(row);

      // For language mode, use manual assignments
      if (manualType === 'language') {
        const lang = languageAssignments.get(row.id) || 'unknown';
        if (!languageMap.has(lang)) languageMap.set(lang, []);
        languageMap.get(lang)!.push(row);
      } else {
        const lang = detectLanguage(row) || 'unknown';
        if (!languageMap.has(lang)) languageMap.set(lang, []);
        languageMap.get(lang)!.push(row);
      }
    }

    // For language mode, check if we have enough distinct languages assigned
    if (manualType === 'language') {
      const uniqueLangs = new Set([...languageMap.keys()].filter(l => l !== 'unknown'));
      const allAssigned = manualRows.every(r => languageAssignments.get(r.id));
      if (!allAssigned || uniqueLangs.size < 2) {
        return {
          id: `ac-manual-${Date.now()}`,
          type: 'language',
          label: TYPE_LABELS.language,
          description: `${manualRows.length} creatives — assign languages to proceed`,
          rows: manualRows,
          taxonomyKey: '',
          deliveryBuckets: bucketMap,
          languages: languageMap,
          manualLanguages: languageAssignments,
          validationErrors: allAssigned && uniqueLangs.size < 2
            ? ['At least 2 distinct languages are required']
            : ['Assign a language to every creative'],
        };
      }
    }

    return {
      id: `ac-manual-${Date.now()}`,
      type: validation.type,
      label: TYPE_LABELS[validation.type],
      description: `${manualRows.length} creatives manually grouped`,
      rows: manualRows,
      taxonomyKey: '',
      deliveryBuckets: bucketMap,
      languages: languageMap,
      manualLanguages: manualType === 'language' ? languageAssignments : undefined,
      validationErrors: validation.errors,
    };
  }, [manualRows, manualType, languageAssignments]);

  const manualSpec = useMemo(() => {
    if (!manualGroup || manualGroup.validationErrors.length > 0) return null;
    return compileAssetFeedSpec(manualGroup, { defaultLanguage, languageTexts: manualLanguageTexts });
  }, [manualGroup, defaultLanguage, manualLanguageTexts]);

  // Toggle handlers
  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreviewGroupId(id);
  }, []);

  const toggleGroupExpand = useCallback((id: string) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAssignLanguage = useCallback((rowId: string, lang: string) => {
    setLanguageAssignments(prev => {
      const next = new Map(prev);
      next.set(rowId, lang);
      return next;
    });
  }, []);

  const handleGroupDefaultLanguageChange = useCallback((groupId: string, lang: string) => {
    setGroupDefaultLanguages(prev => {
      const next = new Map(prev);
      next.set(groupId, lang);
      return next;
    });
  }, []);

  // Apply language text assets from one group to all other language groups
  const handleApplyLanguagesToAll = useCallback((sourceGroupId: string) => {
    const sourceTexts = groupLanguageTexts.get(sourceGroupId);
    const sourceDefault = groupDefaultLanguages.get(sourceGroupId);
    if (!sourceTexts || [...sourceTexts.keys()].length === 0) return;

    const langGroups = detectedGroups.filter(g => g.type === 'language');
    setGroupLanguageTexts(prev => {
      const next = new Map(prev);
      for (const g of langGroups) {
        // Deep copy the texts map
        const copied = new Map<string, Record<string, string>>();
        for (const [lang, texts] of sourceTexts) {
          copied.set(lang, { ...texts });
        }
        next.set(g.id, copied);
      }
      return next;
    });
    if (sourceDefault) {
      setGroupDefaultLanguages(prev => {
        const next = new Map(prev);
        for (const g of langGroups) {
          next.set(g.id, sourceDefault);
        }
        return next;
      });
    }
    // Also select all language groups
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      for (const g of langGroups) {
        next.add(g.id);
      }
      return next;
    });
    toast.success(`Applied text assets to ${langGroups.length} language group(s)`);
  }, [groupLanguageTexts, groupDefaultLanguages, detectedGroups]);

  const handleGroupLanguageTextsChange = useCallback((groupId: string, texts: Map<string, Record<string, string>>) => {
    setGroupLanguageTexts(prev => {
      const next = new Map(prev);
      next.set(groupId, texts);
      return next;
    });
    // Auto-select when 2+ languages are pasted
    if ([...texts.keys()].length >= 2) {
      setSelectedGroupIds(prev => {
        const next = new Set(prev);
        next.add(groupId);
        return next;
      });
      setExpandedGroupIds(prev => {
        const next = new Set(prev);
        next.add(groupId);
        return next;
      });
    }
  }, []);

  const handleConfirmDetected = useCallback(() => {
    setIsCompiling(true);
    try {
      const selected = detectedGroups.filter(g => selectedGroupIds.has(g.id));
      let count = 0;

      for (const group of selected) {
        if (group.validationErrors.length > 0) continue;

        // For language groups, inject selected languages into the group
        if (group.type === 'language') {
          const langTexts = groupLanguageTexts.get(group.id);
          const langs = langTexts ? [...langTexts.keys()] : [];
          if (langs.length < 2) continue;
          const defLang = groupDefaultLanguages.get(group.id) || langs[0];
          // Build language map from pasted languages
          const langMap = new Map<string, CreativeTextAssetRow[]>();
          for (const lang of langs) {
            langMap.set(lang, group.rows);
          }
          const enrichedGroup: DetectedACGroup = {
            ...group,
            languages: langMap,
            manualLanguages: new Map(group.rows.map(r => [r.id, langs[0]])),
          };
          const compiled = compileAssetFeedSpec(enrichedGroup, { defaultLanguage: defLang, languageTexts: langTexts });
          if (compiled.success) {
            onCreateGroup(enrichedGroup, compiled);
            count++;
          }
        } else {
          const compiled = compileAssetFeedSpec(group, { defaultLanguage });
          if (compiled.success) {
            onCreateGroup(group, compiled);
            count++;
          }
        }
      }

      if (count > 0) {
        toast.success(`Created ${count} asset customization group(s)`);
        handleOpenChange(false);
      } else {
        toast.error('No valid groups to create');
      }
    } finally {
      setIsCompiling(false);
    }
  }, [detectedGroups, selectedGroupIds, defaultLanguage, groupDefaultLanguages, groupLanguageTexts, onCreateGroup, handleOpenChange]);

  const handleConfirmManual = useCallback(() => {
    if (!manualGroup || !manualSpec || !manualSpec.success) return;

    setIsCompiling(true);
    try {
      onCreateGroup(manualGroup, manualSpec);
      toast.success(`Created ${TYPE_LABELS[manualGroup.type]} group`);
      handleOpenChange(false);
    } finally {
      setIsCompiling(false);
    }
  }, [manualGroup, manualSpec, onCreateGroup, handleOpenChange]);

  // Count valid selected: for language groups, require 2+ languages from pasted texts
  const validSelectedCount = detectedGroups.filter(g => {
    if (!selectedGroupIds.has(g.id)) return false;
    if (g.validationErrors.length > 0) return false;
    if (g.type === 'language') {
      const langTexts = groupLanguageTexts.get(g.id);
      return langTexts && [...langTexts.keys()].length >= 2;
    }
    return true;
  }).length;

  const totalLanguageGroups = detectedGroups.filter(g => g.type === 'language').length;

  // ─── Render ────────────────────────────────────────────────────────────────

  // Manual mode: user selected creatives first
  if (isManualMode) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl h-[80vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              Create Asset Customization
            </DialogTitle>
            <DialogDescription>
              {manualType
                ? `${TYPE_LABELS[manualType]} — ${manualRows.length} creatives selected`
                : `Select the type of customization for your ${manualRows.length} selected creatives.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 px-6 pb-2">
            <ScrollArea className="h-full">
              {!manualType ? (
                <TypeSelector onSelect={setManualType} />
              ) : manualType === 'language' ? (
                <div className="space-y-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualType(null)}
                      className="text-xs h-7"
                    >
                      ← Back
                    </Button>
                    <div className={cn('p-1.5 rounded-md', TYPE_COLORS.language)}>
                      <Globe className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">Language Customization</span>
                  </div>

                  <LanguageAssignmentPanel
                    rows={manualRows}
                    languageAssignments={languageAssignments}
                    onAssignLanguage={handleAssignLanguage}
                    defaultLanguage={defaultLanguage}
                    onDefaultLanguageChange={setDefaultLanguage}
                  />

                  <LanguageTextInputs
                    languageTexts={manualLanguageTexts}
                    onLanguageTextsChange={setManualLanguageTexts}
                    defaultLanguage={defaultLanguage}
                    onDefaultLanguageChange={setDefaultLanguage}
                  />

                  {manualSpec && (
                    <>
                      <Separator />
                      <SpecPreviewPanel spec={manualSpec} />
                    </>
                  )}
                </div>
              ) : manualType === 'flexible_creative' ? (
                <div className="space-y-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualType(null)}
                      className="text-xs h-7"
                    >
                      ← Back
                    </Button>
                    <div className={cn('p-1.5 rounded-md', TYPE_COLORS.flexible_creative)}>
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">Flexible Creative</span>
                  </div>

                  {/* Show delivery buckets */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Selected Creatives (Multi-format + Multi-language)</span>
                    {manualRows.map(row => {
                      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
                      return (
                        <div key={row.id} className="flex items-center gap-2 pl-2 text-xs p-1.5 border rounded-md">
                          {row.mediaType === 'video' ? <Video className="h-3.5 w-3.5 text-muted-foreground" /> : <Image className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="truncate flex-1">{row.creativeName}</span>
                          <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                            {DELIVERY_BUCKETS[bucket].label}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {/* Language text inputs — same as language mode */}
                  <LanguageTextInputs
                    languageTexts={manualLanguageTexts}
                    onLanguageTextsChange={setManualLanguageTexts}
                    defaultLanguage={defaultLanguage}
                    onDefaultLanguageChange={setDefaultLanguage}
                  />

                  {manualGroup && manualGroup.validationErrors.length > 0 && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">
                        {manualGroup.validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
                      </AlertDescription>
                    </Alert>
                  )}

                  {manualSpec && (
                    <>
                      <Separator />
                      <SpecPreviewPanel spec={manualSpec} />
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualType(null)}
                      className="text-xs h-7"
                    >
                      ← Back
                    </Button>
                    <div className={cn('p-1.5 rounded-md', TYPE_COLORS[manualType])}>
                      {TYPE_ICONS[manualType]}
                    </div>
                    <span className="text-sm font-medium">{TYPE_LABELS[manualType]}</span>
                  </div>

                  {/* Show selected creatives summary */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Selected Creatives</span>
                    {manualRows.map(row => {
                      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
                      return (
                        <div key={row.id} className="flex items-center gap-2 pl-2 text-xs p-1.5 border rounded-md">
                          {row.mediaType === 'video' ? <Video className="h-3.5 w-3.5 text-muted-foreground" /> : <Image className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="truncate flex-1">{row.creativeName}</span>
                          <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                            {DELIVERY_BUCKETS[bucket].label}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {/* Validation feedback */}
                  {manualGroup && manualGroup.validationErrors.length > 0 && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">
                        {manualGroup.validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
                      </AlertDescription>
                    </Alert>
                  )}

                  {manualGroup && manualGroup.validationErrors.length === 0 && (
                    <Alert className="py-2 border-emerald-200 dark:border-emerald-800">
                      <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 inline mr-1" />
                        {manualGroup.description}
                      </AlertDescription>
                    </Alert>
                  )}

                  {manualSpec && (
                    <>
                      <Separator />
                      <SpecPreviewPanel spec={manualSpec} />
                    </>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCompiling}>
              Cancel
            </Button>
            {manualType && (
              <Button
                onClick={handleConfirmManual}
                disabled={isCompiling || !manualGroup || !manualSpec?.success}
                className="gap-2"
              >
                {isCompiling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LayoutGrid className="h-4 w-4" />
                )}
                {isCompiling ? 'Creating...' : 'Create Group'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Auto-detect mode: no pre-selection
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Asset Customization Builder
          </DialogTitle>
          <DialogDescription>
            Auto-detect asset customization opportunities across your Meta creatives.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-6 pb-2">
          <ScrollArea className="h-full">
            <div className="mt-4 space-y-4">
              {detectedGroups.length === 0 ? (
                <Alert>
                  <AlertDescription className="text-xs">
                    No asset customization patterns auto-detected in your {eligibleRows.length} Meta creatives.
                    Select 2+ creatives in the editor and use the Asset Customization button to create groups manually.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {detectedGroups.length} group(s) detected. Select the ones you want to create.
                  </p>
                  <div className="space-y-2">
                    {detectedGroups.map(group => (
                      <DetectedGroupCard
                        key={group.id}
                        group={group}
                        isSelected={selectedGroupIds.has(group.id)}
                        onToggle={() => toggleGroupSelection(group.id)}
                        expanded={expandedGroupIds.has(group.id)}
                        onToggleExpand={() => toggleGroupExpand(group.id)}
                        groupDefaultLanguage={groupDefaultLanguages.get(group.id)}
                        onDefaultLanguageChange={(group.type === 'language' || group.type === 'flexible_creative') ? (lang) => handleGroupDefaultLanguageChange(group.id, lang) : undefined}
                        onApplyToAll={(group.type === 'language' || group.type === 'flexible_creative') ? () => handleApplyLanguagesToAll(group.id) : undefined}
                        totalLanguageGroups={totalLanguageGroups}
                        languageTexts={(group.type === 'language' || group.type === 'flexible_creative') ? (groupLanguageTexts.get(group.id) || new Map()) : undefined}
                        onLanguageTextsChange={(group.type === 'language' || group.type === 'flexible_creative') ? (texts) => handleGroupLanguageTextsChange(group.id, texts) : undefined}
                      />
                    ))}
                  </div>

                  {previewSpec && (
                    <>
                      <Separator />
                      <SpecPreviewPanel spec={previewSpec} />
                    </>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCompiling}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDetected}
            disabled={isCompiling || validSelectedCount === 0}
            className="gap-2"
          >
            {isCompiling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
            {isCompiling
              ? 'Creating...'
              : `Create ${validSelectedCount} Group${validSelectedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
