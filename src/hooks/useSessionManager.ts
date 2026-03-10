import { useState, useEffect, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const SESSION_TOKEN_KEY = "actiplan_session_token";

interface SessionValidation {
  valid: boolean;
  reason?: string;
  currentDevice?: string;
}

export function useSessionManager() {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  });
  const [isValidSession, setIsValidSession] = useState<boolean>(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const validationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Register a new session after login
  const registerSession = useCallback(async (session: Session): Promise<string | null> => {
    try {
      const deviceInfo = `${navigator.userAgent.substring(0, 100)}`;
      
      const { data, error } = await supabase.functions.invoke("register-session", {
        body: { deviceInfo },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error("Failed to register session:", error);
        return null;
      }

      if (data?.sessionToken) {
        localStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
        setSessionToken(data.sessionToken);
        setIsValidSession(true);
        setValidationError(null);
        return data.sessionToken;
      }

      return null;
    } catch (err) {
      console.error("Error registering session:", err);
      return null;
    }
  }, []);

  // Validate the current session
  const validateSession = useCallback(async (session: Session): Promise<SessionValidation> => {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    
    if (!token) {
      return { valid: false, reason: "no_token" };
    }

    try {
      const { data, error } = await supabase.functions.invoke("validate-session", {
        body: { sessionToken: token },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error("Session validation error:", error);
        return { valid: true }; // Assume valid on error to not disrupt user
      }

      if (!data?.valid) {
        setIsValidSession(false);
        setValidationError(data?.reason === "logged_in_elsewhere" 
          ? `You've been signed out because you logged in from another device${data?.currentDevice ? ` (${data.currentDevice.substring(0, 50)}...)` : ""}.`
          : "Your session has expired. Please sign in again.");
        return data;
      }

      setIsValidSession(true);
      setValidationError(null);
      return data;
    } catch (err) {
      console.error("Error validating session:", err);
      return { valid: true }; // Assume valid on error
    }
  }, []);

  // Clear session on sign out
  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setSessionToken(null);
    setIsValidSession(true);
    setValidationError(null);
    
    if (validationIntervalRef.current) {
      clearInterval(validationIntervalRef.current);
      validationIntervalRef.current = null;
    }
  }, []);

  // Start periodic validation
  const startValidation = useCallback((session: Session) => {
    // Clear any existing interval
    if (validationIntervalRef.current) {
      clearInterval(validationIntervalRef.current);
    }

    // Validate every 30 seconds
    validationIntervalRef.current = setInterval(async () => {
      const result = await validateSession(session);
      if (!result.valid && result.reason === "logged_in_elsewhere") {
        // Stop validation and trigger sign out
        if (validationIntervalRef.current) {
          clearInterval(validationIntervalRef.current);
          validationIntervalRef.current = null;
        }
      }
    }, 30000);
  }, [validateSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (validationIntervalRef.current) {
        clearInterval(validationIntervalRef.current);
      }
    };
  }, []);

  return {
    sessionToken,
    isValidSession,
    validationError,
    registerSession,
    validateSession,
    clearSession,
    startValidation,
  };
}
