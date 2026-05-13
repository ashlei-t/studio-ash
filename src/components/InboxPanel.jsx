import { useState } from "react";
import { AssistantMarkdown } from "../AssistantMarkdown.jsx";
import { useInbox } from "../hooks/useInbox.js";
import { applyContextUpdates } from "../lib/applyUpdates.js";
import { useScope } from "../scope/useScope.js";

export function InboxPanel({ onClose }) {
  const { scope, teams } = useScope();
  const { items, loading, resolve } = useInbox();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const scopeLabel = scope.kind === "team"
    ? `team · ${teams.find((t) => t.id === scope.id)?.name ?? scope.id.slice(0, 6)}`
    : "personal";

  async function accept(item) {
    setBusyId(item.id);
    setError("");
    try {
      const updates = Array.isArray(item.suggested_updates) ? item.suggested_updates : [];
      if (updates.length) {
        const applied = await applyContextUpdates(updates);
        if (!applied.length) {
          setError("nothing to apply");
        }
      }
      await resolve(item.id, "accepted");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  }

  async function dismiss(item) {
    setBusyId(item.id);
    await resolve(item.id, "dismissed");
    setBusyId("");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 110,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "0.75rem 1.25rem max(1rem, env(safe-area-inset-bottom))",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          marginBottom: "0.75rem",
          padding: "10px 12px",
          borderRadius: "var(--sa-composer-radius, 10px)",
          background: "var(--color-bg-panel)",
          border: "0.5px solid var(--color-border-tertiary)",
        }}
      >
        <p
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            margin: 0,
            letterSpacing: "var(--type-track-label)",
            textTransform: "uppercase",
          }}
        >
          inbox · {scopeLabel}
        </p>
        <p
          style={{
            margin: "0 0 0 8px",
            fontSize: 9,
            color: "var(--color-text-tertiary)",
            letterSpacing: "var(--type-track-meta)",
          }}
        >
          beta
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto",
            fontSize: 9,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            fontFamily: "var(--sa-chat-font)",
            letterSpacing: "var(--type-track-meta)",
            padding: "4px 0",
          }}
        >
          close
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading && items.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>···</p>
        )}
        {!loading && items.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0, fontStyle: "italic" }}>
            nothing to review.
          </p>
        )}
        {error && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-danger)" }}>{error}</p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            style={{
              marginBottom: "0.75rem",
              padding: "12px",
              borderRadius: "var(--sa-composer-radius, 10px)",
              border: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-bg-panel)",
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 12,
                color: "var(--color-text-primary)",
                fontFamily: "var(--sa-chat-font)",
                fontWeight: 500,
              }}
            >
              {item.title}
            </p>
            {item.body && (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, marginBottom: 8 }}>
                <AssistantMarkdown>{item.body}</AssistantMarkdown>
              </div>
            )}
            {Array.isArray(item.suggested_updates) && item.suggested_updates.length > 0 && (
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 10,
                  color: "var(--color-text-tertiary)",
                  letterSpacing: "var(--type-track-meta)",
                }}
              >
                will touch: {item.suggested_updates.map((u) => `${u.file} (${u.mode})`).join(", ")}
              </p>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => accept(item)}
                disabled={busyId === item.id}
                style={{
                  border: "0.5px solid var(--color-border-accent)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 10,
                  fontFamily: "var(--sa-chat-font)",
                  cursor: busyId === item.id ? "default" : "pointer",
                  opacity: busyId === item.id ? 0.6 : 1,
                }}
              >
                accept
              </button>
              <button
                type="button"
                onClick={() => dismiss(item)}
                disabled={busyId === item.id}
                style={{
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-secondary)",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 10,
                  fontFamily: "var(--sa-chat-font)",
                  cursor: busyId === item.id ? "default" : "pointer",
                }}
              >
                dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
