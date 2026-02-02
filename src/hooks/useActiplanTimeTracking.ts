import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];

interface UseActiplanTimeTrackingOptions {
  campaignId: string | null;
  enabled?: boolean;
}

export function useActiplanTimeTracking({ campaignId, enabled = true }: UseActiplanTimeTrackingOptions) {
  const { user } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  
  const sessionIdRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const accumulatedSecondsRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(true);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());

  // Start a new session
  const startSession = useCallback(async () => {
    if (!campaignId || !user?.id || !enabled) return;

    try {
      // Close any existing active session for this campaign/user
      await supabase
        .from("actiplan_time_sessions")
        .update({ 
          is_active: false, 
          session_end: new Date().toISOString() 
        })
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id)
        .eq("is_active", true);

      // Create new session
      const { data, error } = await supabase
        .from("actiplan_time_sessions")
        .insert({
          campaign_id: campaignId,
          user_id: user.id,
          session_start: new Date().toISOString(),
          active_seconds: 0,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) {
        console.error("[TimeTracking] Error starting session:", error);
        return;
      }

      sessionIdRef.current = data.id;
      accumulatedSecondsRef.current = 0;
      lastHeartbeatRef.current = Date.now();
      isActiveRef.current = true;
      setIsTracking(true);
      
      console.log("[TimeTracking] Session started:", data.id);
    } catch (err) {
      console.error("[TimeTracking] Failed to start session:", err);
    }
  }, [campaignId, user?.id, enabled]);

  // Update session with accumulated time
  const updateSession = useCallback(async (endSession: boolean = false) => {
    if (!sessionIdRef.current) return;

    try {
      const now = Date.now();
      
      // Only add time if user was active
      if (isActiveRef.current) {
        const secondsSinceLastHeartbeat = Math.floor((now - lastHeartbeatRef.current) / 1000);
        accumulatedSecondsRef.current += secondsSinceLastHeartbeat;
      }
      
      lastHeartbeatRef.current = now;

      const updateData: Record<string, any> = {
        active_seconds: accumulatedSecondsRef.current,
      };

      if (endSession) {
        updateData.is_active = false;
        updateData.session_end = new Date().toISOString();
      }

      await supabase
        .from("actiplan_time_sessions")
        .update(updateData)
        .eq("id", sessionIdRef.current);

      if (endSession) {
        console.log("[TimeTracking] Session ended. Total seconds:", accumulatedSecondsRef.current);
        sessionIdRef.current = null;
        setIsTracking(false);
      }
    } catch (err) {
      console.error("[TimeTracking] Failed to update session:", err);
    }
  }, []);

  // Mark user as idle
  const markIdle = useCallback(() => {
    if (!isActiveRef.current) return;
    
    // Save accumulated time before going idle
    const now = Date.now();
    const secondsSinceLastHeartbeat = Math.floor((now - lastHeartbeatRef.current) / 1000);
    accumulatedSecondsRef.current += secondsSinceLastHeartbeat;
    lastHeartbeatRef.current = now;
    
    isActiveRef.current = false;
    console.log("[TimeTracking] User idle. Accumulated:", accumulatedSecondsRef.current, "seconds");
  }, []);

  // Mark user as active
  const markActive = useCallback(() => {
    if (isActiveRef.current) return;
    
    isActiveRef.current = true;
    lastHeartbeatRef.current = Date.now();
    console.log("[TimeTracking] User active again");
  }, []);

  // Reset idle timeout on activity
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    // Mark as active if was idle
    markActive();
    
    // Set new idle timeout
    idleTimeoutRef.current = setTimeout(markIdle, IDLE_TIMEOUT_MS);
  }, [markActive, markIdle]);

  // Handle visibility change (tab switch, minimize)
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      markIdle();
    } else {
      handleActivity();
    }
  }, [markIdle, handleActivity]);

  // Handle window blur/focus
  const handleWindowBlur = useCallback(() => {
    markIdle();
  }, [markIdle]);

  const handleWindowFocus = useCallback(() => {
    handleActivity();
  }, [handleActivity]);

  // Handle page unload
  const handleBeforeUnload = useCallback(() => {
    if (sessionIdRef.current) {
      // Use sendBeacon for reliable delivery on page close
      const now = Date.now();
      if (isActiveRef.current) {
        const secondsSinceLastHeartbeat = Math.floor((now - lastHeartbeatRef.current) / 1000);
        accumulatedSecondsRef.current += secondsSinceLastHeartbeat;
      }
      
      // Sync update using fetch with keepalive
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/actiplan_time_sessions?id=eq.${sessionIdRef.current}`,
        JSON.stringify({
          active_seconds: accumulatedSecondsRef.current,
          is_active: false,
          session_end: new Date().toISOString(),
        })
      );
    }
  }, []);

  // Setup effect
  useEffect(() => {
    if (!campaignId || !user?.id || !enabled) {
      return;
    }

    // Start session
    startSession();

    // Setup activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Setup visibility listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Start initial idle timeout
    idleTimeoutRef.current = setTimeout(markIdle, IDLE_TIMEOUT_MS);

    // Setup heartbeat interval
    heartbeatIntervalRef.current = setInterval(() => {
      updateSession(false);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      // Cleanup listeners
      ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Clear intervals/timeouts
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }

      // End session
      updateSession(true);
    };
  }, [campaignId, user?.id, enabled, startSession, handleActivity, handleVisibilityChange, handleWindowBlur, handleWindowFocus, handleBeforeUnload, markIdle, updateSession]);

  return { isTracking };
}

// Helper function to format seconds to readable time
export function formatActiveTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
