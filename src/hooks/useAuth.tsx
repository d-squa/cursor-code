import { useCallback, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const userRef = useRef<User | null>(null);
  const navigate = useNavigate();

  const syncAuthState = useCallback((session: Session | null, forceUserUpdate = false) => {
    sessionRef.current = session;

    const nextUser = session?.user ?? null;
    const prevUser = userRef.current;
    const userChanged =
      prevUser?.id !== nextUser?.id ||
      prevUser?.email_confirmed_at !== nextUser?.email_confirmed_at;

    if (forceUserUpdate || userChanged) {
      userRef.current = nextUser;
      setUser(nextUser);
    } else {
      userRef.current = nextUser;
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      syncAuthState(session, event === "USER_UPDATED");
    });

    return () => subscription.unsubscribe();
  }, [syncAuthState]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getSession = useCallback(() => sessionRef.current, []);
  const getAccessToken = useCallback(() => sessionRef.current?.access_token ?? null, []);

  // Check if user's email is confirmed
  const isEmailConfirmed = Boolean(user?.email_confirmed_at);

  return {
    user,
    session: sessionRef.current,
    loading,
    signOut,
    isEmailConfirmed,
    getSession,
    getAccessToken,
  };
}
