/**
 * Fires the Google Ads Subscribe conversion event.
 * Should be called once after a successful trial subscription activation.
 */
const SUBSCRIBE_CONVERSION_DEDUPE_KEY = "__actiplan_subscribe_conversion_last_fired_at";
const SUBSCRIBE_CONVERSION_DEDUPE_WINDOW_MS = 30_000;

export const fireSubscribeConversion = () => {
  try {
    const w = window as any;

    if (typeof w.gtag !== "function") {
      console.warn("[ConversionTracking] gtag not available");
      return;
    }

    const now = Date.now();
    const lastFiredAt = Number(w[SUBSCRIBE_CONVERSION_DEDUPE_KEY] ?? 0);

    if (now - lastFiredAt < SUBSCRIBE_CONVERSION_DEDUPE_WINDOW_MS) {
      console.warn("[ConversionTracking] Duplicate subscribe conversion skipped");
      return;
    }

    w[SUBSCRIBE_CONVERSION_DEDUPE_KEY] = now;
    w.gtag("event", "conversion", {
      send_to: "AW-17548787406/gwSYCNW-9IMcEM799K9B",
    });
    console.log("[ConversionTracking] Subscribe conversion fired");
  } catch (err) {
    console.error("[ConversionTracking] Error firing conversion:", err);
  }
};
