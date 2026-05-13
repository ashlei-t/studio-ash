import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { setContextScope } from "../lib/contextStore.js";
import { useAuth } from "../auth/useAuth.js";
import { ScopeContext } from "./context.js";
import { setLastTeamCreateError } from "./teamErrors.js";

export function ScopeProvider({ children }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [scope, setScopeState] = useState({ kind: "personal", id: null });
  // scopeVersion bumps when scope changes so subscribers (useDocument etc.) reload.
  const [scopeVersion, setScopeVersion] = useState(0);

  const reloadTeams = useCallback(async () => {
    if (!user) {
      setTeams([]);
      return;
    }
    const { data, error } = await supabase
      .from("team_members")
      .select("role, team:teams(id, name, slug)")
      .eq("user_id", user.id);
    if (error) {
      console.warn("[scope] load teams:", error.message);
      return;
    }
    setTeams(
      (data || [])
        .map((row) => ({ ...row.team, role: row.role }))
        .filter((t) => t.id),
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScopeState({ kind: "personal", id: null });
      setContextScope({ kind: "personal", id: null });
      setTeams([]);
      return;
    }
    setScopeState({ kind: "personal", id: user.id });
    setContextScope({ kind: "personal", id: user.id });
    reloadTeams();
  }, [user, reloadTeams]);

  const setScope = useCallback(
    (next) => {
      const resolved = next?.kind === "team" && next.id
        ? { kind: "team", id: next.id }
        : { kind: "personal", id: user?.id ?? null };
      setScopeState(resolved);
      setContextScope(resolved);
      setScopeVersion((v) => v + 1);
    },
    [user],
  );

  const createTeam = useCallback(
    async (name) => {
      if (!user || !name?.trim()) return null;
      setLastTeamCreateError(null);
      const { data, error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), created_by: user.id })
        .select("id, name, slug")
        .single();
      if (error) {
        setLastTeamCreateError(error.message);
        console.warn("[scope] create team:", error.message);
        return null;
      }
      await reloadTeams();
      return data;
    },
    [user, reloadTeams],
  );

  const createInvite = useCallback(
    async (teamId) => {
      if (!user || !teamId) return null;
      const { data, error } = await supabase
        .from("team_invites")
        .insert({ team_id: teamId, created_by: user.id })
        .select("token")
        .single();
      if (error) {
        console.warn("[scope] create invite:", error.message);
        return null;
      }
      return data?.token ?? null;
    },
    [user],
  );

  const value = useMemo(
    () => ({ scope, teams, setScope, reloadTeams, createTeam, createInvite, scopeVersion }),
    [scope, teams, setScope, reloadTeams, createTeam, createInvite, scopeVersion],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
