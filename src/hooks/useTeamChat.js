import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { useAuth } from "../auth/useAuth.js";

export function useTeamChat(teamId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const seenIdsRef = useRef(new Set());

  const merge = useCallback((incoming) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const msg of incoming) {
        if (seenIdsRef.current.has(msg.id)) continue;
        seenIdsRef.current.add(msg.id);
        next.push(msg);
      }
      next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!teamId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      seenIdsRef.current = new Set();
      return undefined;
    }
    let cancelled = false;
    seenIdsRef.current = new Set();
    setMessages([]);
    setLoading(true);

    supabase
      .from("team_messages")
      .select("id, team_id, author_id, kind, body, created_at, has_inbox_suggestion")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[team-chat] load:", error.message);
        } else if (data) {
          merge(data);
        }
        setLoading(false);
      });

    const channel = supabase
      .channel(`team-messages:${teamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages", filter: `team_id=eq.${teamId}` },
        (payload) => {
          if (!payload.new) return;
          merge([payload.new]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [teamId, merge]);

  const send = useCallback(
    async (text) => {
      const body = (text || "").trim();
      if (!body || !teamId || !user) return false;
      const { error } = await supabase
        .from("team_messages")
        .insert({ team_id: teamId, author_id: user.id, kind: "human", body });
      if (error) {
        console.warn("[team-chat] send:", error.message);
        return false;
      }
      return true;
    },
    [teamId, user],
  );

  return { messages, loading, send };
}
