/**
 * Fires the Google Ads Subscribe conversion event.
 * Should be called once after a successful subscription activation.
 */
const GOOGLE_ADS_ID = "AW-17548787406";
const SUBSCRIBE_CONVERSION_SEND_TO = "AW-17548787406/gwSYCNW-9IMcEM799K9B";
const SUBSCRIBE_CONVERSION_FIRED_KEYS_STORAGE = "__actiplan_subscribe_conversion_fired_keys";
const SUBSCRIBE_CONVERSION_PENDING_KEYS = "__actiplan_subscribe_conversion_pending_keys";
const GTAG_READY_RETRY_MS = 250;
const GTAG_READY_MAX_RETRIES = 20;

type TrackingWindow = Window & {
  gtag?: (...args: any[]) => void;
  [SUBSCRIBE_CONVERSION_PENDING_KEYS]?: Record<string, boolean>;
};

const readFiredKeys = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(SUBSCRIBE_CONVERSION_FIRED_KEYS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeFiredKeys = (keys: Record<string, number>) => {
  try {
    localStorage.setItem(SUBSCRIBE_CONVERSION_FIRED_KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    // ignore localStorage write failures
  }
};

const hasFired = (dedupeKey: string) => {
  const firedKeys = readFiredKeys();
  return Boolean(firedKeys[dedupeKey]);
};

const markFired = (dedupeKey: string, w: TrackingWindow) => {
  const firedKeys = readFiredKeys();
  firedKeys[dedupeKey] = Date.now();
  writeFiredKeys(firedKeys);

  if (w[SUBSCRIBE_CONVERSION_PENDING_KEYS]) {
    delete w[SUBSCRIBE_CONVERSION_PENDING_KEYS][dedupeKey];
  }
};

const markPending = (dedupeKey: string, w: TrackingWindow) => {
  w[SUBSCRIBE_CONVERSION_PENDING_KEYS] = w[SUBSCRIBE_CONVERSION_PENDING_KEYS] || {};
  w[SUBSCRIBE_CONVERSION_PENDING_KEYS]![dedupeKey] = true;
};

const clearPending = (dedupeKey: string, w: TrackingWindow) => {
  if (w[SUBSCRIBE_CONVERSION_PENDING_KEYS]) {
    delete w[SUBSCRIBE_CONVERSION_PENDING_KEYS][dedupeKey];
  }
};

const fireWhenGtagReady = (w: TrackingWindow, dedupeKey: string, attempt = 0) => {
  if (typeof w.gtag === "function") {
    // Ensure config is set before firing conversion event to avoid "config out of order"
    w.gtag("config", GOOGLE_ADS_ID);
    w.gtag("event", "conversion", {
      send_to: SUBSCRIBE_CONVERSION_SEND_TO,
    });

    markFired(dedupeKey, w);
    console.log("[ConversionTracking] Subscribe conversion fired", { dedupeKey });
    return;
  }

  if (attempt >= GTAG_READY_MAX_RETRIES) {
    clearPending(dedupeKey, w);
    console.warn("[ConversionTracking] gtag not available, subscribe conversion skipped", { dedupeKey });
    return;
  }

  window.setTimeout(() => {
    fireWhenGtagReady(w, dedupeKey, attempt + 1);
  }, GTAG_READY_RETRY_MS);
};

export const fireSubscribeConversion = (dedupeKey = "subscribe-default") => {
  try {
    const w = window as TrackingWindow;

    if (hasFired(dedupeKey)) {
      console.warn("[ConversionTracking] Duplicate subscribe conversion skipped", { dedupeKey });
      return;
    }

    if (w[SUBSCRIBE_CONVERSION_PENDING_KEYS]?.[dedupeKey]) {
      console.warn("[ConversionTracking] Subscribe conversion already pending", { dedupeKey });
      return;
    }

    markPending(dedupeKey, w);
    fireWhenGtagReady(w, dedupeKey);
  } catch (err) {
    console.error("[ConversionTracking] Error firing conversion:", err);
  }
};
