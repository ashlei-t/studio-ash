import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { useAuth } from "../auth/useAuth.js";
import { useScope } from "../scope/useScope.js";

export function useInbox() {
  const { user } = useAuth();
  const { scope } = useScope();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("inbox_items")
      .select("id, scope, user_id, team_id, title, body, suggested_updates, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (scope.kind === "team" && scope.id) {
      query = query.eq("scope", "team").eq("team_id", scope.id);
    } else {
      query = query.eq("scope", "personal").eq("user_id", user.id);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[inbox] load:", error.message);
      setLoading(false);
      return;
    }
    setItems(data || []);
    setLoading(false);
  }, [scope, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const resolve = useCallback(
    async (id, status) => {
      const { error } = await supabase
        .from("inbox_items")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        console.warn("[inbox] resolve:", error.message);
        return false;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      return true;
    },
    [],
  );

  return { items, loading, reload, resolve };
}
