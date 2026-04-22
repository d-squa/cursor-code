// Google Ads call-to-action options shared by the non-Search text editor,
// the Excel import/export, and the DSP push.
//
// Google's `AdCallToActionAsset.text` (used by Demand Gen Video, Video
// Responsive, etc.) and `DemandGenMultiAssetAdInfo.call_to_action_text` accept
// a free-form display string, but Google only renders a fixed set of supported
// CTA phrases. We expose:
//
//   - GOOGLE_CTA_OPTIONS — internal API enum + UI-friendly display label
//   - normalizeGoogleCta() — turn any user input (label, enum, snake/space
//     case) back into the canonical enum value.
//   - googleCtaDisplayText() — the exact display string Google expects on the
//     button (e.g. "Learn more"). This is what we send on push.

export interface GoogleCtaOption {
  /** Canonical internal enum value persisted in the DB / row. */
  value: string;
  /** UI-friendly label shown in dropdowns and Excel headers. */
  label: string;
  /** Exact display text sent to the Google Ads API. */
  displayText: string;
}

export const GOOGLE_CTA_OPTIONS: GoogleCtaOption[] = [
  { value: 'LEARN_MORE',  label: 'Learn More',  displayText: 'Learn more' },
  { value: 'SHOP_NOW',    label: 'Shop Now',    displayText: 'Shop now' },
  { value: 'SIGN_UP',     label: 'Sign Up',     displayText: 'Sign up' },
  { value: 'SUBSCRIBE',   label: 'Subscribe',   displayText: 'Subscribe' },
  { value: 'DOWNLOAD',    label: 'Download',    displayText: 'Download' },
  { value: 'BOOK_NOW',    label: 'Book Now',    displayText: 'Book now' },
  { value: 'CONTACT_US',  label: 'Contact Us',  displayText: 'Contact us' },
  { value: 'GET_QUOTE',   label: 'Get Quote',   displayText: 'Get quote' },
  { value: 'APPLY_NOW',   label: 'Apply Now',   displayText: 'Apply now' },
  { value: 'ORDER_NOW',   label: 'Order Now',   displayText: 'Order now' },
  { value: 'INSTALL',     label: 'Install',     displayText: 'Install' },
  { value: 'WATCH_NOW',   label: 'Watch Now',   displayText: 'Watch now' },
  { value: 'GET_OFFER',   label: 'Get Offer',   displayText: 'Get offer' },
  { value: 'VISIT_SITE',  label: 'Visit Site',  displayText: 'Visit site' },
  { value: 'SEE_MORE',    label: 'See More',    displayText: 'See more' },
];

const LOOKUP: Map<string, GoogleCtaOption> = (() => {
  const m = new Map<string, GoogleCtaOption>();
  for (const opt of GOOGLE_CTA_OPTIONS) {
    m.set(opt.value.toLowerCase(), opt);
    m.set(opt.label.toLowerCase(), opt);
    m.set(opt.displayText.toLowerCase(), opt);
    m.set(opt.value.replace(/_/g, ' ').toLowerCase(), opt);
    m.set(opt.value.replace(/_/g, '').toLowerCase(), opt);
  }
  // Common aliases that map to nearest supported option.
  m.set('install_app', m.get('install')!);
  m.set('install app', m.get('install')!);
  m.set('install_now', m.get('install')!);
  m.set('watch_more', m.get('watch_now')!);
  m.set('watch more', m.get('watch_now')!);
  return m;
})();

/** Normalize any user-entered CTA into a canonical Google enum value, or '' if unrecognised. */
export function normalizeGoogleCta(input?: string | null): string {
  if (!input) return '';
  const key = String(input).trim().toLowerCase();
  if (!key) return '';
  const hit = LOOKUP.get(key);
  return hit ? hit.value : '';
}

/** Get the exact display string Google expects on the button for a given enum value. */
export function googleCtaDisplayText(value?: string | null): string {
  const normalized = normalizeGoogleCta(value);
  if (!normalized) return '';
  const opt = GOOGLE_CTA_OPTIONS.find((o) => o.value === normalized);
  return opt?.displayText || '';
}

/** Comma-separated label list — useful for Excel header hints. */
export const GOOGLE_CTA_LABEL_LIST = GOOGLE_CTA_OPTIONS.map((o) => o.label).join(', ');
