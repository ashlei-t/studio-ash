import { useEffect, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { setContextUser } from "../lib/contextStore.js";
import { AuthContext } from "./context.js";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[auth] failed to load profile", error.message);
      setProfile(null);
      return;
    }
    setProfile(data ?? null);
  }

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setContextUser(data.session?.user?.id ?? null);
      loadProfile(data.session?.user?.id).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
      setContextUser(next?.user?.id ?? null);
      loadProfile(next?.user?.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signOut: () => supabase.auth.signOut(),
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
