import type { FunctionsHttpError } from "@supabase/supabase-js";

/** Read JSON/text error body from a failed `supabase.functions.invoke` call. */
export async function getEdgeFunctionErrorMessage(
  error: FunctionsHttpError | Error | null | undefined,
  fallback = "Request failed",
): Promise<string> {
  if (!error) return fallback;

  const ctx = (error as FunctionsHttpError)?.context as Response | undefined;
  if (ctx) {
    try {
      const payload = await ctx.clone().json();
      if (payload && typeof payload === "object") {
        const msg = payload.error ?? payload.message;
        if (typeof msg === "string" && msg.length > 0) return msg;
      }
    } catch {
      try {
        const text = await ctx.clone().text();
        if (text?.trim()) return text.trim();
      } catch {
        // ignore
      }
    }
  }

  return error.message || fallback;
}
