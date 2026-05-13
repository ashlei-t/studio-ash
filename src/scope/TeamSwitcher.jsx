import { useState } from "react";
import { getLastTeamCreateError } from "./teamErrors.js";
import { useScope } from "./useScope.js";

export function TeamSwitcher({ compact = false }) {
  const { scope, teams, setScope, createTeam } = useScope();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const activeId = scope.kind === "team" ? scope.id : "personal";

  async function onChange(e) {
    const value = e.target.value;
    if (value === "personal") {
      setScope({ kind: "personal" });
    } else if (value === "__new__") {
      setCreating(true);
    } else {
      setScope({ kind: "team", id: value });
    }
  }

  async function submitNew(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setCreateError("");
    const team = await createTeam(name);
    setBusy(false);
    if (team) {
      setScope({ kind: "team", id: team.id });
      setCreating(false);
      setName("");
    } else {
      setCreateError(getLastTeamCreateError() || "could not create team");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select
        value={activeId}
        onChange={onChange}
        style={{
          border: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-bg)",
          color: "var(--color-text-secondary)",
          borderRadius: 8,
          padding: compact ? "3px 6px" : "6px 8px",
          fontSize: 11,
          fontFamily: "var(--sa-chat-font)",
          cursor: "pointer",
          maxWidth: 200,
        }}
      >
        <option value="personal">personal</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value="__new__">+ new team</option>
      </select>
      {creating && (
        <form onSubmit={submitNew} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="team name"
            style={{
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-bg)",
              color: "var(--color-text-primary)",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "var(--sa-chat-font)",
              outline: "none",
              width: 120,
            }}
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            style={{
              border: "0.5px solid var(--color-border-accent)",
              background: "var(--color-bg)",
              color: "var(--color-text-primary)",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "var(--sa-chat-font)",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "..." : "create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--color-text-tertiary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            cancel
          </button>
          {createError && (
            <p style={{ width: "100%", margin: 0, fontSize: 10, color: "var(--color-text-danger)" }}>{createError}</p>
          )}
        </form>
      )}
    </div>
  );
}
