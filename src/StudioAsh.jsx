import { useEffect, useRef, useState } from "react";
import { ChatView } from "./components/ChatView.jsx";
import { DebugPanel } from "./components/DebugPanel.jsx";
import { KanbanBoard } from "./components/KanbanBoard.jsx";
import { SettingsPanel } from "./components/SettingsPanel.jsx";
import { useDocument } from "./hooks/useDocument.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { useKanban } from "./hooks/useKanban.js";
import { formatDate, getTimeSlot } from "./lib/time.js";

export default function StudioAsh() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const currentSlot = getTimeSlot(now.getHours());
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const [boardHidden, setBoardHidden] = useState(false);
  const isMobile = useIsMobile(900);
  const { entries, submit, loading, toast, nowContent } = useDocument();
  const kanban = useKanban(nowContent || "");
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const longPressRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setDebugOpen((d) => !d);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onWordmarkDown() {
    longPressRef.current = setTimeout(() => setDebugOpen((d) => !d), 600);
  }
  function onWordmarkUp() { clearTimeout(longPressRef.current); }

  return (
    <div
      id="studio-ash-root"
      style={{
        maxWidth: isMobile || boardHidden ? "var(--sa-max-width)" : "min(1280px, 96vw)",
        margin: "0 auto",
        padding: "2rem 1.25rem 0",
        fontFamily: "var(--sa-chat-font)",
        height: "100svh",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
      }}
    >

      {/* Header */}
      <div style={{ marginBottom: "1rem", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <p
          onPointerDown={onWordmarkDown}
          onPointerUp={onWordmarkUp}
          onPointerLeave={onWordmarkUp}
          style={{
            fontFamily: "var(--font-logo)",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: "0 0 4px",
            letterSpacing: "var(--type-track-display)",
            textTransform: "uppercase",
            cursor: "default",
            userSelect: "none",
          }}
        >***</p>
          {!isMobile && (
            <button
              type="button"
              onClick={() => setBoardHidden((v) => !v)}
              aria-label={boardHidden ? "Show board" : "Hide board"}
              title={boardHidden ? "Show board" : "Hide board"}
              style={{
                marginLeft: "auto",
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-bg)",
                color: "var(--color-text-secondary)",
                borderRadius: 8,
                width: 24,
                height: 24,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              <img
                src="/kanban.png"
                alt=""
                width={14}
                height={14}
                style={{ display: "block", objectFit: "contain" }}
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
            style={{
              marginLeft: isMobile ? "auto" : undefined,
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-bg)",
              color: "var(--color-text-secondary)",
              borderRadius: 8,
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ⚙
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
          {formatDate(now)}
          <span style={{ marginLeft: 10, color: "var(--color-text-tertiary)" }}>{timeStr}</span>
        </p>
      </div>

      <div className="sa-main">
        <div className="sa-main__chat">
          <ChatView
            entries={entries}
            submit={submit}
            loading={loading}
            currentSlot={currentSlot}
            toast={toast}
          />
        </div>
        {!isMobile && !boardHidden && (
          <div className="sa-main__board">
            {!kanban.ready ? (
              <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: 11 }}>loading board...</p>
            ) : (
              <KanbanBoard
                tasks={kanban.tasks}
                onMoveTask={kanban.moveTask}
                onMoveTaskToPosition={kanban.moveTaskToPosition}
                onUpdateTaskText={kanban.updateTaskText}
                onDeleteTask={kanban.deleteTask}
              />
            )}
          </div>
        )}
      </div>

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

    </div>
  );
}
