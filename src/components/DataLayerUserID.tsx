import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/**
 * Pushes the authenticated user's ID to the dataLayer for GTM/GA4 cross-device tracking.
 * - On initial load / page refresh: pushes userId immediately if available.
 * - On login: pushes a 'login' event with userId.
 * - On logout: pushes userId as undefined to clear it.
 */
export function DataLayerUserID() {
  useEffect(() => {
    // Push userId on initial load if session exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.dataLayer = window.dataLayer || [];
      if (session?.user?.id) {
        window.dataLayer.push({ userId: session.user.id });
      }
    });

    // Listen for auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      window.dataLayer = window.dataLayer || [];

      if (event === "SIGNED_IN" && session?.user?.id) {
        window.dataLayer.push({
          event: "login",
          userId: session.user.id,
        });
      } else if (event === "SIGNED_OUT") {
        window.dataLayer.push({ userId: undefined });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
