/**
 * Fires the Google Ads Subscribe conversion event.
 * Should be called once after a successful trial subscription activation.
 */
export const fireSubscribeConversion = () => {
  try {
    const w = window as any;
    if (typeof w.gtag === "function") {
      w.gtag("event", "conversion", {
        send_to: "AW-17548787406/gwSYCNW-9IMcEM799K9B",
      });
      w.gtag("config", "AW-17548787406");
      console.log("[ConversionTracking] Subscribe conversion fired");
    } else {
      console.warn("[ConversionTracking] gtag not available");
    }
  } catch (err) {
    console.error("[ConversionTracking] Error firing conversion:", err);
  }
};
