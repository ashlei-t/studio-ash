import { useEffect, useRef } from "react";
import { supabase } from "../../utils/supabase.js";
import {
  clearPendingInvite,
  readPendingInviteToken,
  stashPendingInviteFromUrl,
  stripJoinFromUrl,
} from "../lib/pendingInvite.js";
import { useScope } from "./useScope.js";

export function JoinTeam() {
  const { setScope, reloadTeams } = useScope();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    stashPendingInviteFromUrl();
    const token = readPendingInviteToken();
    if (!token) return;
    ranRef.current = true;

    (async () => {
      const { data, error } = await supabase.rpc("redeem_invite", { p_token: token });
      if (error) {
        console.warn("[join-team] redeem failed:", error.message);
        ranRef.current = false;
        return;
      }
      const teamId = typeof data === "string" ? data : data;
      if (!teamId) {
        ranRef.current = false;
        return;
      }
      clearPendingInvite();
      stripJoinFromUrl();
      await reloadTeams();
      setScope({ kind: "team", id: teamId });
    })();
  }, [setScope, reloadTeams]);

  return null;
}
