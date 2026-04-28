import { DayView } from "./DayView.jsx";

export function DebugPanel({ onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sa-debug-logged-label"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "0.75rem 1.25rem max(1rem, env(safe-area-inset-bottom))",
        background: "var(--color-bg)",
        boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.06)",
      }}
    >
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        marginBottom: "1rem",
        padding: "10px 12px",
        borderRadius: "var(--sa-composer-radius, 10px)",
        background: "var(--color-bg-panel)",
        border: "0.5px solid var(--color-border-tertiary)",
      }}>
        <p
          id="sa-debug-logged-label"
          style={{
            fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)",
            margin: 0, letterSpacing: "var(--type-track-label)", textTransform: "uppercase",
          }}
        >logged</p>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto", fontSize: 9, background: "transparent",
            border: "none", cursor: "pointer", color: "var(--color-text-tertiary)",
            fontFamily: "var(--sa-chat-font)", letterSpacing: "var(--type-track-meta)", padding: "4px 0",
          }}
        >close</button>
      </div>
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "12px 14px 16px",
        borderRadius: "var(--sa-composer-radius, 10px)",
        background: "var(--color-bg-panel)",
        border: "0.5px solid var(--color-border-tertiary)",
      }}>
        <DayView />
      </div>
    </div>
  );
}
