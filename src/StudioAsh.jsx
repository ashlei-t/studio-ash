import { useState, useEffect, useRef, useCallback } from "react";
import { AssistantMarkdown, InlineMd } from "./AssistantMarkdown.jsx";

function getTimeSlot(hour) {
  if (hour >= 5  && hour < 14) return "morning";
  if (hour >= 14 && hour < 21) return "focus";
  return "evening";
}
function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const VIEWS = [
  { id: "morning", label: "morning" },
  { id: "focus",   label: "focus" },
  { id: "evening", label: "evening" },
];

const ghostBtn = {
  fontSize: 12,
  padding: "4px 14px",
  borderRadius: 6,
  border: "0.5px solid var(--color-border-tertiary)",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  color: "var(--color-text-tertiary)",
  lineHeight: 1,
};

// ── API ───────────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, messages, onResult) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  try {
    const res = await fetch("/api/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await res.json();
    onResult(data.content?.[0]?.text || data.error?.message || JSON.stringify(data));
  } catch (e) {
    onResult(`error: ${e.message}`);
  }
}

async function readContextFile(file) {
  try {
    const res = await fetch(`/api/context/${file}`);
    return res.ok ? await res.text() : "";
  } catch { return ""; }
}

async function writeContextFile(file, content, mode = "replace") {
  const res = await fetch(`/api/context/${file}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mode }),
  });
  return res.ok;
}

// ── Context update parsing ────────────────────────────────────────────────────

const UPDATE_RE = /---UPDATE:([\w.]+):(append|replace)---([\s\S]*?)---END---/g;

function parseResponse(text) {
  const updates = [];
  UPDATE_RE.lastIndex = 0;
  let match;
  while ((match = UPDATE_RE.exec(text)) !== null) {
    updates.push({ file: match[1], mode: match[2], content: match[3].trim() });
  }
  UPDATE_RE.lastIndex = 0;
  const displayText = text.replace(UPDATE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { displayText, updates };
}

// ── Context instructions ──────────────────────────────────────────────────────

const CONTEXT_INSTRUCTIONS = `
## Updating context files

When the user explicitly asks you to update a file, include ONE OR MORE structured blocks in your response.
The blocks are silently processed and stripped from your visible reply.

To APPEND a new entry to log.md:
---UPDATE:log.md:append---
### [Weekday, D Month YYYY]
[1–4 sentence summary of what happened or was decided today]
---END---

To REPLACE the full content of now.md (use the complete file content):
---UPDATE:now.md:replace---
[full updated now.md content, reflecting any new tasks, completions, or changes]
---END---

To REPLACE the full content of context.md (use the complete file content):
---UPDATE:context.md:replace---
[full updated context.md content]
---END---

Only include update blocks when the user explicitly asks ("update log", "mark that done in now.md", "log this", etc.).
Never emit partial or malformed blocks.
`;

// ── Shared hook for context + API ─────────────────────────────────────────────

function useThread(storageKey, systemPromptBase) {
  const [thread, setThread] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState({ context: "", now: "", log: "" });
  const [toast, setToast] = useState("");

  const loadContext = useCallback(async () => {
    const [context, now, log] = await Promise.all([
      readContextFile("context.md"),
      readContextFile("now.md"),
      readContextFile("log.md"),
    ]);
    setCtx({ context, now, log });
  }, []);

  useEffect(() => { loadContext(); }, [loadContext]);

  function buildSystemPrompt() {
    const parts = [systemPromptBase];
    if (ctx.context) parts.push(`\n## Personal context\n${ctx.context}`);
    if (ctx.now)     parts.push(`\n## Current sprint (now.md)\n${ctx.now}`);
    if (ctx.log)     parts.push(`\n## Log (log.md)\n${ctx.log}`);
    parts.push(CONTEXT_INSTRUCTIONS);
    return parts.join("\n");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleUpdates(updates) {
    if (!updates.length) return;
    const updated = [];
    for (const { file, content, mode } of updates) {
      const ok = await writeContextFile(file, content, mode);
      if (ok) updated.push(file);
    }
    if (updated.length) {
      await loadContext();
      showToast(`updated: ${updated.join(", ")}`);
    }
  }

  function send() {
    const content = input.trim();
    if (!content || loading) return;
    const userMsg = { role: "user", content, ts: Date.now() };
    const newThread = [...thread, userMsg];
    setThread(newThread);
    setInput("");
    setLoading(true);

    const apiMessages = newThread.map(({ role, content }) => ({ role, content }));
    callClaude(buildSystemPrompt(), apiMessages, async (raw) => {
      const { displayText, updates } = parseResponse(raw);
      const assistantMsg = { role: "assistant", content: displayText, ts: Date.now() };
      const final = [...newThread, assistantMsg];
      setThread(final);
      localStorage.setItem(storageKey, JSON.stringify(final));
      setLoading(false);
      await handleUpdates(updates);
    });
  }

  return { thread, input, setInput, loading, toast, send };
}

// ── ChatThread — for morning / focus / evening ────────────────────────────────
// Fixed-height layout: messages scroll inside a container, input always pinned.

function ChatThread({ storageKey, systemPromptBase, placeholder = "what's on your mind." }) {
  const { thread, input, setInput, loading, toast, send } = useThread(storageKey, systemPromptBase);
  const containerRef = useRef(null);

  // Scroll the messages container (not the page) to the bottom on every update.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [thread, loading]);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {thread.map((msg, i) => (
          <div key={i} style={{ padding: "0.55rem 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            {msg.role === "user" ? (
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "var(--color-text-primary)", fontFamily: "var(--font-user)" }}>
                {msg.content}
              </p>
            ) : (
              <div style={{ borderLeft: "2px solid var(--color-border-accent)", paddingLeft: 12 }}>
                <AssistantMarkdown>{msg.content}</AssistantMarkdown>
                {msg.ts && (
                  <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "6px 0 0", fontFamily: "var(--font-user)" }}>
                    {formatTime(msg.ts)}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ padding: "0.55rem 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ borderLeft: "2px solid var(--color-border-accent)", paddingLeft: 12 }}>
              <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0, fontFamily: "var(--font-sans)" }}>···</p>
            </div>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <textarea
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            style={{
              flex: 1, resize: "none", border: "none", outline: "none",
              borderBottom: "0.5px solid var(--color-border-secondary)",
              background: "transparent", padding: "4px 0 6px",
              fontFamily: "var(--font-sans)", fontSize: 14,
              lineHeight: 1.7, color: "var(--color-text-primary)",
            }}
          />
          <button onClick={send} disabled={loading} style={{ ...ghostBtn, border: "none", padding: "4px 8px", fontSize: 16, opacity: loading ? 0.35 : 1 }}>
            ↵
          </button>
        </div>
        {toast && (
          <p style={{ fontSize: 11, color: "var(--color-text-success)", margin: "8px 0 0", letterSpacing: "0.04em" }}>
            {toast}
          </p>
        )}
      </div>

    </div>
  );
}

// ── LogThread — for + / quick capture ────────────────────────────────────────
// Field Notes strip: "14:23 — capture text. — *ack.*"  (single subdued line)

function LogThread({ storageKey, systemPromptBase, placeholder = "what just happened." }) {
  const { thread, input, setInput, loading, toast, send } = useThread(storageKey, systemPromptBase);
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [thread, loading]);

  const pairs = [];
  for (let i = 0; i < thread.length; i++) {
    if (thread[i].role === "user") {
      const next = thread[i + 1];
      const hasAssistant = next?.role === "assistant";
      pairs.push({ user: thread[i], assistant: hasAssistant ? next : null });
      if (hasAssistant) i++;
    }
  }

  const lastIdx = pairs.length - 1;

  function handleKey(e) {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 2 }}>
        {pairs.map((pair, i) => {
          const isLatest = i === lastIdx;
          const pendingAck = loading && isLatest && !pair.assistant;
          return (
            <div
              key={i}
              style={{
                padding: "0.45rem 0",
                borderBottom: "0.5px solid var(--color-border-tertiary)",
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--color-text-primary)",
                wordBreak: "break-word",
                fontFamily: "var(--font-sans)",
              }}
            >
              <span style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                {formatTime(pair.user.ts)}
              </span>
              <span style={{ color: "var(--color-text-tertiary)" }}> — </span>
              <span style={{ whiteSpace: "pre-wrap" }}>{pair.user.content}</span>
              {pendingAck && (
                <>
                  <span style={{ color: "var(--color-text-tertiary)" }}> — </span>
                  <em style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>···</em>
                </>
              )}
              {pair.assistant && (
                <>
                  <span style={{ color: "var(--color-text-tertiary)" }}> — </span>
                  <em style={{ fontStyle: "italic", color: "var(--color-text-secondary)" }}>
                    <InlineMd text={pair.assistant.content} />
                  </em>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ flexShrink: 0, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={loading}
            style={{
              flex: 1, border: "none", outline: "none",
              borderBottom: "0.5px solid var(--color-border-secondary)",
              background: "transparent", padding: "4px 0 6px",
              fontFamily: "var(--font-sans)", fontSize: 13,
              lineHeight: 1.5, color: "var(--color-text-primary)",
            }}
          />
          <button onClick={send} disabled={loading} style={{ ...ghostBtn, border: "none", padding: "4px 8px", fontSize: 16, opacity: loading ? 0.35 : 1 }}>
            ↵
          </button>
        </div>
        {toast && (
          <p style={{ fontSize: 11, color: "var(--color-text-success)", margin: "8px 0 0", letterSpacing: "0.04em" }}>
            {toast}
          </p>
        )}
      </div>

    </div>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function MorningView() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <ChatThread
      storageKey="sa_morning_thread"
      placeholder="whatever's on your mind. no filter."
      systemPromptBase={`You are a calm, grounding presence in Studio Ash, a personal daily companion.
The user is doing their morning pages — freewriting to replace scrolling with reflection.
Respond briefly (2-4 sentences). Notice if their wheels are spinning or they're trying to do too much.
Be warm, honest, and grounding. Gently surface any to-dos buried in the writing.
Don't be a productivity coach — be a thoughtful presence.
Keep responses concise unless asked to expand.`}
    />
    </div>
  );
}

function FocusView() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <ChatThread
      storageKey="sa_focus_thread"
      placeholder="dump everything. tasks, ideas, what's been on your mind."
      systemPromptBase={`You are a focused, practical assistant in Studio Ash.
The user is transitioning into their work block. They're brain-dumping tasks, ideas, and to-dos.
Help them get into flow. Break their dump into a clear, realistic plan. Be concise. Prioritize ruthlessly.
Cross-reference with their sprint context (now.md) when relevant.
Keep responses concise unless asked to expand.`}
    />
    </div>
  );
}

function EveningView() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <ChatThread
      storageKey="sa_evening_thread"
      placeholder="what worked. what moved. what to let go of."
      systemPromptBase={`You are a warm, reflective presence in Studio Ash, a personal daily companion.
It's the end of the user's workday. They're closing out the day.
After their reflection, respond with:
1. A brief (2-3 sentence) insight about the day — patterns, progress, what stood out
2. 2-3 gentle suggestions for winding down (not productivity tips — actual rest)
3. One thing worth carrying into tomorrow
Be warm and human. Keep follow-up responses concise.`}
    />
    </div>
  );
}

function PlusView() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <LogThread
      storageKey="sa_plus_thread"
      placeholder="what just happened."
      systemPromptBase={`You are a quiet line in a Field Notes log — not a chat partner.
The user writes quick captures: thoughts, events, decisions, one-liners.
Your entire reply must be ONE short clause (roughly under 100 characters): lowercase, no paragraph breaks, no bullets, no markdown, no numbered lists.
Tone: spare, handwritten margin-note. Examples: "noted." / "worth tracking." / "flag for tomorrow." / "heavy — breathe first."
If they mention a task or decision, acknowledge it in that same clipped register.
Never write more than one sentence.`}
    />
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function StudioAsh() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hour = now.getHours();
  const [view, setView] = useState(getTimeSlot(hour));
  const [navOpen, setNavOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const currentLabel = VIEWS.find(v => v.id === view)?.label || view;
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      maxWidth: 480,
      margin: "0 auto",
      padding: "2rem 1.25rem 1.5rem",
      fontFamily: "var(--font-sans)",
      height: "100svh",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexShrink: 0 }}>
        <div>
          <p style={{
            fontFamily: "var(--font-logo)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: "0 0 4px",
            letterSpacing: "0.045em",
            textTransform: "uppercase",
          }}>Studio Ash</p>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, fontFamily: "var(--font-sans)" }}>
            {formatDate(now)}
            <span style={{ marginLeft: 10, color: "var(--color-text-tertiary)" }}>{timeStr}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => { setPlusOpen(o => !o); setNavOpen(false); }}
            style={{ ...ghostBtn, border: "0.5px solid var(--color-border-tertiary)", color: plusOpen ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}
          >+</button>
          <button
            onClick={() => { setNavOpen(o => !o); setPlusOpen(false); }}
            style={{ ...ghostBtn, border: "0.5px solid var(--color-border-tertiary)" }}
          >
            {navOpen ? "close" : `${currentLabel} ···`}
          </button>
        </div>
      </div>

      {plusOpen && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          border: "1px solid var(--color-border-secondary)",
          borderRadius: 12,
          padding: "14px 16px",
          background: "var(--color-background-panel)",
          boxSizing: "border-box",
        }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 1rem", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>+</p>
          <PlusView />
        </div>
      )}

      {navOpen && (
        <div style={{ marginBottom: "2rem", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, overflow: "hidden" }}>
          {VIEWS.map((v, i) => (
            <button key={v.id} onClick={() => { setView(v.id); setNavOpen(false); }} style={{
              display: "block", width: "100%", textAlign: "left", fontSize: 13,
              padding: "9px 14px", border: "none",
              borderBottom: i < VIEWS.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
              background: view === v.id ? "var(--color-background-secondary)" : "transparent",
              color: view === v.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              fontWeight: view === v.id ? 500 : 400,
            }}>{v.label}</button>
          ))}
        </div>
      )}

      {!navOpen && !plusOpen && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          border: "1px solid var(--color-border-secondary)",
          borderRadius: 12,
          padding: "14px 16px",
          background: "var(--color-background-panel)",
          boxSizing: "border-box",
        }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 1.25rem", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
            {currentLabel}
          </p>
          {view === "morning" && <MorningView />}
          {view === "focus"   && <FocusView />}
          {view === "evening" && <EveningView />}
        </div>
      )}

    </div>
  );
}
