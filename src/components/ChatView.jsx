import { useEffect, useRef, useState } from "react";
import { AssistantMarkdown } from "../AssistantMarkdown.jsx";
import { useTypingEffect } from "../hooks/useTypingEffect.js";
import { PLACEHOLDER_MAP } from "../lib/prompts.js";
import { formatTime } from "../lib/time.js";

export function ChatView({ entries, submit, loading, currentSlot, toast }) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  const lastEntry = entries[entries.length - 1];
  const lastResponse = lastEntry?.response || null;
  const { displayed: typedResponse, done: typingDone } = useTypingEffect(lastResponse);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, typedResponse, loading]);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, [currentSlot]);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const t = draft.trim();
    if (!t || loading) return;
    submit(t);
    setDraft("");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        autoGrow(el);
      }
    });
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  const canSend = draft.trim().length > 0 && !loading;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* Messages */}
      <div ref={scrollRef} className="sa-chat__scroll">
        {entries.map((entry, i) => {
          const isLast = i === entries.length - 1;
          const responseText = isLast && !typingDone ? typedResponse : entry.response;
          const showCursor = isLast && !typingDone;

          return (
            <div key={i}>
              {/* User bubble */}
              <div className="sa-bubble sa-bubble--user">
                <p>{entry.text}</p>
                <span className="sa-bubble__time">{formatTime(entry.ts)} · {entry.slot}</span>
              </div>

              {/* Assistant bubble */}
              {responseText && (
                <div className="sa-bubble sa-bubble--assistant">
                  {showCursor ? (
                    <p className="sa-bubble__typing">
                      {responseText}
                      <span className="sa-cursor" />
                    </p>
                  ) : (
                    <AssistantMarkdown>{responseText}</AssistantMarkdown>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {loading && !lastResponse && (
          <div className="sa-bubble sa-bubble--assistant">
            <p className="sa-loading-dots" aria-label="Assistant is typing">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <p style={{ fontSize: 10, color: "var(--color-text-success)", padding: "0 0 0.5rem", letterSpacing: "var(--type-track-meta)" }}>
          {toast}
        </p>
      )}

      {/* Composer */}
      <div style={{ flexShrink: 0, padding: "0.75rem 0 1rem" }}>
        <div className="sa-composer">
          <textarea
            ref={textareaRef}
            className="sa-chat__textarea"
            rows={1}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); autoGrow(e.target); }}
            onKeyDown={handleKey}
            placeholder={PLACEHOLDER_MAP[currentSlot] || "write."}
          />
          <button
            type="button"
            className="sa-composer__send"
            onClick={send}
            disabled={!canSend}
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
