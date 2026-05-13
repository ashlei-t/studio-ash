import { useState } from "react";
import { useScope } from "./useScope.js";

export function InviteButton({ compact = false }) {
  const { scope, teams, createInvite } = useScope();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (scope.kind !== "team" || !scope.id) return null;
  const team = teams.find((t) => t.id === scope.id);
  if (!team || !["owner", "admin"].includes(team.role)) return null;

  async function onInvite() {
    setBusy(true);
    setErr("");
    const t = await createInvite(scope.id);
    setBusy(false);
    if (!t) {
      setErr("could not create invite");
      return;
    }
    setToken(t);
    setOpen(true);
  }

  const link = token ? `${window.location.origin}/?join=${token}` : "";

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      setErr("copy failed — select and copy manually");
    }
  }

  if (open && token) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 280 }}>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          style={{
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-primary)",
            background: "var(--color-bg-panel)",
          }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            onClick={copyLink}
            style={{
              border: "0.5px solid var(--color-border-accent)",
              background: "var(--color-bg)",
              color: "var(--color-text-primary)",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 10,
              fontFamily: "var(--sa-chat-font)",
              cursor: "pointer",
            }}
          >
            copy link
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setToken(null); }}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--color-text-tertiary)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            close
          </button>
        </div>
        {err && <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-danger)" }}>{err}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <button
        type="button"
        onClick={onInvite}
        disabled={busy}
        style={{
          border: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-bg)",
          color: "var(--color-text-secondary)",
          borderRadius: 8,
          padding: compact ? "3px 8px" : "5px 10px",
          fontSize: 10,
          fontFamily: "var(--sa-chat-font)",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "…" : "invite"}
      </button>
      {err && !open && <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-danger)" }}>{err}</p>}
    </div>
  );
}
