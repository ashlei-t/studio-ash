import { useEffect, useRef, useState } from "react";
import { AssistantMarkdown } from "../AssistantMarkdown.jsx";
import { useAuth } from "../auth/useAuth.js";
import { useTeamChat } from "../hooks/useTeamChat.js";
import { maybePostObserverInsight } from "../lib/teamObserver.js";
import { formatTime } from "../lib/time.js";

const OBSERVER_DEBOUNCE_MS = 12_000;

export function TeamChatView({ teamId, teamName }) {
  const { user } = useAuth();
  const { messages, loading, send } = useTeamChat(teamId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const observerTimerRef = useRef(null);
  const observerRunningRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Debounced observer: after activity settles, ask Claude whether to chime in.
  useEffect(() => {
    if (!teamId || !messages.length) return undefined;
    const last = messages[messages.length - 1];
    if (last.kind !== "human") return undefined;

    if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    observerTimerRef.current = setTimeout(async () => {
      if (observerRunningRef.current) return;
      observerRunningRef.current = true;
      try {
        await maybePostObserverInsight({ teamId, messages });
      } finally {
        observerRunningRef.current = false;
      }
    }, OBSERVER_DEBOUNCE_MS);

    return () => {
      if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    };
  }, [teamId, messages]);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  async function onSend() {
    const text = draft.trim();
    if (!text) return;
    const ok = await send(text);
    if (ok) setDraft("");
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <p
        style={{
          margin: "0 0 0.5rem",
          fontSize: 10,
          color: "var(--color-text-tertiary)",
          letterSpacing: "var(--type-track-label)",
          textTransform: "uppercase",
        }}
      >
        {teamName ? `team · ${teamName}` : "team"}
      </p>

      <div ref={scrollRef} className="sa-chat__scroll">
        {loading && messages.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>···</p>
        )}
        {messages.map((m) => {
          const mine = m.author_id && m.author_id === user?.id;
          const isAssistant = m.kind === "assistant";
          if (isAssistant) {
            return (
              <div key={m.id} className="sa-bubble sa-bubble--assistant">
                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: 9,
                    color: "var(--color-text-tertiary)",
                    letterSpacing: "var(--type-track-meta)",
                    textTransform: "uppercase",
                  }}
                >
                  assistant
                </p>
                <AssistantMarkdown>{m.body}</AssistantMarkdown>
                {m.has_inbox_suggestion && (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 9,
                      color: "var(--color-text-tertiary)",
                      letterSpacing: "var(--type-track-meta)",
                      fontStyle: "italic",
                    }}
                  >
                    1 suggestion in inbox — open ✉ to review
                  </p>
                )}
                <span className="sa-bubble__time">{formatTime(new Date(m.created_at).getTime())}</span>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className="sa-bubble sa-bubble--user"
              style={mine ? undefined : { marginLeft: 0, marginRight: "auto", background: "var(--color-bg-panel)" }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 9,
                  color: "var(--color-text-tertiary)",
                  letterSpacing: "var(--type-track-meta)",
                  textTransform: "uppercase",
                }}
              >
                {mine ? "you" : (m.author_id || "anon").slice(0, 6)}
              </p>
              <p>{m.body}</p>
              <span className="sa-bubble__time">{formatTime(new Date(m.created_at).getTime())}</span>
            </div>
          );
        })}
      </div>

      <div style={{ flexShrink: 0, padding: "0.75rem 0 1rem" }}>
        <div className="sa-composer">
          <textarea
            ref={textareaRef}
            className="sa-chat__textarea"
            rows={1}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); autoGrow(e.target); }}
            onKeyDown={handleKey}
            placeholder="say something to the team."
          />
          <button
            type="button"
            className="sa-composer__send"
            onClick={onSend}
            disabled={!draft.trim()}
            aria-label="Send message"
            title="Send (Enter)"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
