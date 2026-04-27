import { useState, useEffect, useRef, useCallback } from "react";
import { AssistantMarkdown } from "./AssistantMarkdown.jsx";

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

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

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

function normalizeLogBlock(text) {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

// ── Context update parsing ────────────────────────────────────────────────────

const UPDATE_RE =
  /---UPDATE:([\w.]+):(append|replace)---([\s\S]*?)---\s*END(?:\s*---|\s*$)/g;

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
## Context files (silent updates)

You may end your reply with structured blocks. They are applied by the app and **removed** before the user sees your message. The user should **never** need to say "log this", "put that in now.md", or "update context"—infer from what they said.

### now.md — running tasks & sprint (their to-do list)
- Treat the latest **now.md** in this prompt as the source of truth. They will ask you later to turn it into a **flow or schedule**; keep it accurate as you go.
- When they mention a **new** obligation, follow-up, deadline, or phrasing like "I need to…", "remind me to…", "still have to…", add it (usually as an unchecked \`- [ ]\` line in the right section, matching their existing style).
- When they clearly **completed**, **cancelled**, or **delegated** something that still appears open in now.md, mark it \`- [x]\` or remove it—whichever fits how they write the file.
- Use **replace** with the **entire** updated file: copy the current now.md, change only what this conversation implies, and preserve everything else (headings, sections, unrelated projects).
- If nothing in now.md should change this turn, omit the now.md block.
- **Focus thread:** Brain-dumps often change now.md—apply the bullets above when their dump adds, completes, or reprioritizes work.
- **+ quick capture:** Use **replace** when they state a **new** task, a **completion**, or a **correction** to a line that appears in now.md.

### log.md — dated day notes
- **append** a short dated entry when something **worth remembering** happened: a decision, milestone, emotional beat, or "how the day went"—not every reply.
- **Morning thread:** Substantive pages (not just "hi") → append a dated \`log.md\` block for today when mood, tension, or a line is worth replaying later.
- **Focus thread:** Append when they mention a **decision, milestone, or emotional beat** worth remembering—not for every minor plan tweak.
- **Evening thread:** If they reflect on their day in any real way (energy, wins, friction, closure), **always** append a dated \`log.md\` block for today—unless they only greeted you or said nothing substantive. This is the default; do not wait for them to ask.
- **+ quick capture:** Treat as field notes: **default to** a \`log.md\` append for the capture unless the line is truly trivial.

### context.md — slow-moving background
- **replace** with the full file only when **durable facts** shift: projects, people, tools, preferences, constraints. Day-to-day tasks belong in now.md, not here.

### Block syntax (exactly this shape)

Append to log.md:
---UPDATE:log.md:append---
### [Weekday, D Month YYYY]
[1–4 sentences]
---END---

Replace now.md (full file body):
---UPDATE:now.md:replace---
[complete merged now.md]
---END---

Replace context.md (full file body):
---UPDATE:context.md:replace---
[complete merged context.md]
---END---

Never emit partial or malformed blocks. Use separate blocks if more than one file changes.
- **At most one \`log.md\` append per reply** unless two clearly different beats happened in the same turn. Never emit two append blocks with the same dated heading and same paragraph—that duplicates the file.
`;

// ── Prompt map (keyed by time slot) ───────────────────────────────────────────

const PROMPT_MAP = {
  morning: `You are a calm, direct presence in Studio Ash. The user is doing 
morning pages — freewriting to clear their head before the day. 
Read what they write and respond in 2-3 sentences. Notice the 
energy underneath it — whether they're scattered, sharp, heavy, 
or good. Surface any buried tasks without making it a to-do review. 
You have context on who this person is — use it quietly, don't announce it. 

## Silent updates (do not skip)
After your visible reply, use the context-file instructions: when 
their pages are substantive, append \`log.md\` for today (tone, 
tension, memorable lines). When they add or complete tasks vs. 
now.md, emit \`now.md\` replace. Never ask them to log or update files.

Never reference their astrology directly.
Never use motivational language, affirmations, or inspirational 
framing. No "you've got this", no rhetorical questions, no em-dashes 
for dramatic effect. Write like a sharp friend who doesn't perform 
warmth. Don't coach. Don't cheerlead. Just be honest and present.

When you emit context update blocks, also include one line at the 
very start of your visible reply (before anything else) that says 
what you logged in plain English — e.g. "added Cindy follow-up to 
your sprint." — then a line break before your actual response. 
Keep it under 10 words. Only include it when something actually changed.`,

  focus: `You are a practical thinking partner. The user is transitioning 
into their work block and brain-dumping tasks, ideas, and to-dos. 
Turn their dump into a realistic plan — ordered, specific, nothing 
vague. Flag if they're overloading the day or starting too many 
things at once without finishing what's already open. Cross-reference 
now.md and call out anything that conflicts or needs to move. 
You have context on who this person is — use it quietly, don't announce it. 

## Silent updates (do not skip)
After your visible reply, use the context-file instructions: 
\`now.md\` replace when their dump adds, completes, or reprioritizes 
work vs. the sprint in context. \`log.md\` append when they mention a 
decision, milestone, or emotional beat worth remembering. Never ask 
them to log or update files.

Never reference their astrology directly.
No preamble, just the plan. Never use motivational language, 
affirmations, or inspirational framing. No "you've got this", 
no rhetorical questions, no em-dashes for dramatic effect. 
Write like a sharp friend who doesn't perform warmth.

When you emit context update blocks, also include one line at the 
very start of your visible reply (before anything else) that says 
what you logged in plain English — e.g. "added Cindy follow-up to 
your sprint." — then a line break before your actual response. 
Keep it under 10 words. Only include it when something actually changed.`,

  evening: `You are a grounded presence at the end of the user's workday. 
Read their reflection and respond with: one honest observation 
about the day (2 sentences max), occasionally one real wind-down 
suggestion — not a habit tip, something that actually helps a 
person decompress. One thing worth carrying into tomorrow. 
Don't recap what they said back to them. Say something true.
You have context on who this person is — use it quietly, don't announce it. 

## Silent log (do not skip)
If they wrote anything substantive about how the day went, what 
landed, or what they're releasing, you **must** follow your 
context-file instructions and end with a \`log.md\` **append** block 
for today's date (exact \`---UPDATE:log.md:append---\` … \`---END---\` 
syntax). The app strips it before they see the message—never ask 
them to log it or confirm. Omit the block only when their message 
was trivial (e.g. hi / ok / nothing yet).

Never reference their astrology directly.
Never use motivational language, affirmations, or inspirational 
framing. No "you've got this", no rhetorical questions, no em-dashes 
for dramatic effect. Write like a sharp friend who doesn't perform 
warmth.

When you emit context update blocks, also include one line at the 
very start of your visible reply (before anything else) that says 
what you logged in plain English — e.g. "added Cindy follow-up to 
your sprint." — then a line break before your actual response. 
Keep it under 10 words. Only include it when something actually changed.`,
};

const PLACEHOLDER_MAP = {
  morning: "good morning.",
  focus:   "what's been on your mind.",
  evening: "good evening",
};

const KANBAN_FILE = "kanban.json";
const KANBAN_COLUMNS = ["todos", "doing it", "done"];
const KANBAN_TITLES = {
  todos: "todos",
  "doing it": "doing it",
  done: "done",
};

function normalizeTaskText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

function buildTaskId(prefix = "task") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseNowTasks(nowContent) {
  if (!nowContent) return [];
  const tasks = [];
  const lines = nowContent.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const text = m[2].trim();
    if (!text) continue;
    tasks.push({
      id: `now-${normalizeTaskText(text).replace(/\s+/g, "-").slice(0, 80)}`,
      text,
      status: done ? "done" : "todos",
      source: "now.md",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return tasks;
}

function parseChatTasks(text) {
  if (!text) return [];
  const pieces = text
    .split(/\n+/)
    .flatMap(line => line.split(/[.;](?:\s+|$)/))
    .map(s => s.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);

  const isTaskLike = (value) => {
    if (value.length < 8 || value.length > 180) return false;
    if (/\?$/.test(value)) return false;
    const lowered = value.toLowerCase();
    if (/^(hi|hello|thanks|ok|yes|no)\b/.test(lowered)) return false;
    return /(^|\b)(need to|todo|to do|fix|finish|build|send|create|update|plan|deploy|write|confirm|ship|review|follow up)\b/.test(lowered);
  };

  return pieces
    .filter(isTaskLike)
    .map(value => ({
      id: buildTaskId("chat"),
      text: value,
      status: "todos",
      source: "chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
}

function mergeTasks(existing, incoming) {
  const out = [...existing];
  const seen = new Set(existing.map(t => normalizeTaskText(t.text)));
  for (const task of incoming) {
    const key = normalizeTaskText(task.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(task);
  }
  return out;
}

// ── Document hook (single scrollable day) ─────────────────────────────────────

function useDocument({ onUserMessage } = {}) {
  const docFile = "thread_document.json";
  const [entries, setEntries] = useState([]);
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

  useEffect(() => {
    loadContext();
    readContextFile(docFile).then(raw => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        const last = parsed[parsed.length - 1];
        if (last?.ts && isSameCalendarDay(new Date(last.ts), new Date())) {
          setEntries(parsed);
        }
      } catch { /* start fresh */ }
    });
  }, [loadContext]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleUpdates(updates) {
    if (!updates.length) return;
    const updated = [];
    for (const { file, content, mode } of updates) {
      if (mode === "append" && file === "log.md") {
        const cur = await readContextFile(file);
        const piece = normalizeLogBlock(content);
        const normalizedCur = normalizeLogBlock(cur);
        // Prevent duplicate daily entries even when the same block
        // is appended again later (not only as the final suffix).
        if (piece && normalizedCur.includes(piece)) continue;
      }
      const ok = await writeContextFile(file, content, mode);
      if (ok) updated.push(file);
    }
    if (updated.length) {
      await loadContext();
      showToast(`updated: ${[...new Set(updated)].join(", ")}`);
    }
  }

  function buildSystemPrompt(slot) {
    const parts = [PROMPT_MAP[slot] || PROMPT_MAP.morning];
    if (ctx.context) parts.push(`\n## Personal context\n${ctx.context}`);
    if (ctx.now)     parts.push(`\n## Current sprint (now.md)\n${ctx.now}`);
    if (ctx.log)     parts.push(`\n## Log (log.md)\n${ctx.log}`);
    parts.push(CONTEXT_INSTRUCTIONS);
    return parts.join("\n");
  }

  function submit(text) {
    const content = text.trim();
    if (!content || loading) return;
    if (onUserMessage) onUserMessage(content);
    const slot = getTimeSlot(new Date().getHours());
    const entry = { slot, text: content, ts: Date.now(), response: null };
    const next = [...entries, entry];
    setEntries(next);
    setLoading(true);

    const messages = next
      .filter(e => e.text)
      .flatMap(e => {
        const out = [{ role: "user", content: e.text }];
        if (e.response) out.push({ role: "assistant", content: e.response });
        return out;
      });

    callClaude(buildSystemPrompt(slot), messages, async (raw) => {
      try {
        const { displayText, updates } = parseResponse(raw);
        const final = next.map((e, i) =>
          i === next.length - 1 ? { ...e, response: displayText } : e
        );
        setEntries(final);
        await writeContextFile(docFile, JSON.stringify(final), "replace");
        await handleUpdates(updates);
      } finally {
        setLoading(false);
      }
    });
  }

  return { entries, submit, loading, toast, nowContent: ctx.now };
}

// ── Daily record helpers ──────────────────────────────────────────────────────

function getTodayLogEntries(logContent, today = new Date()) {
  if (!logContent) return [];
  // Match on "D Month YYYY" only — ignores weekday so a mismatch won't break it
  const datePart = today.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const lines = logContent.split("\n");
  const entries = [];
  let capturing = false;
  let current = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (capturing && current.length) entries.push(current.join("\n").trim());
      capturing = line.includes(datePart);
      current = [];
    } else if (capturing) {
      current.push(line);
    }
  }
  if (capturing && current.length) entries.push(current.join("\n").trim());
  return entries.filter(e => e.length > 0);
}

// ── DayView — daily log entries ───────────────────────────────────────────────

function DayView() {
  const [entries, setEntries] = useState([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const log = await readContextFile("log.md");
    setEntries(getTodayLogEntries(log, new Date()));
    setReady(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {!ready && (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0 }}>···</p>
      )}

      {ready && entries.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0, fontStyle: "italic" }}>
          nothing logged yet today.
        </p>
      )}

      {entries.map((entry, i) => (
        <div key={i} style={{ marginBottom: "1.1rem" }}>
          {i > 0 && <div style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", margin: "0 0 0.9rem" }} />}
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--color-text-primary)", fontFamily: "var(--sa-chat-font)" }}>
            <AssistantMarkdown>{entry}</AssistantMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Typing animation ──────────────────────────────────────────────────────────

function useTypingEffect(text, speed = 14) {
  const [displayed, setDisplayed] = useState(text || "");
  const [done, setDone] = useState(true);
  const prevRef = useRef(text);
  const mountRef = useRef(false);

  useEffect(() => {
    if (!mountRef.current) {
      mountRef.current = true;
      prevRef.current = text;
      setDisplayed(text || "");
      setDone(true);
      return;
    }
    if (text === prevRef.current) return;
    prevRef.current = text;
    if (!text) { setDisplayed(""); setDone(true); return; }

    setDone(false);
    let i = 0;
    setDisplayed("");
    const id = setInterval(() => {
      i += 1 + Math.floor(Math.random() * 2);
      if (i >= text.length) { i = text.length; clearInterval(id); setDone(true); }
      setDisplayed(text.slice(0, i));
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return { displayed, done };
}

// ── ChatView — bubbles ────────────────────────────────────────────────────────

function ChatView({ entries, submit, loading, currentSlot, toast }) {
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
      if (el) { el.style.height = "auto"; autoGrow(el); }
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
            <p style={{ color: "var(--color-text-tertiary)", margin: 0, fontSize: 12 }}>···</p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <p style={{ fontSize: 10, color: "var(--color-text-success)", padding: "0 0 0.5rem", letterSpacing: "0.04em" }}>
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
            onChange={e => { setDraft(e.target.value); autoGrow(e.target); }}
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

function useKanban(nowContent) {
  const [tasks, setTasks] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadKanban() {
      const raw = await readContextFile(KANBAN_FILE);
      if (cancelled) return;
      if (!raw.trim()) {
        setTasks([]);
        setReady(true);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        const normalized = Array.isArray(parsed)
          ? parsed.map((task) => ({
              ...task,
              status: task.status === "backlog" ? "todos" : task.status,
            }))
          : [];
        setTasks(normalized);
      } catch {
        setTasks([]);
      } finally {
        setReady(true);
      }
    }
    void loadKanban();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void writeContextFile(KANBAN_FILE, JSON.stringify(tasks, null, 2), "replace");
  }, [tasks, ready]);

  useEffect(() => {
    if (!ready) return;
    const fromNow = parseNowTasks(nowContent);
    if (!fromNow.length) return;
    setTasks(prev => mergeTasks(prev, fromNow));
  }, [nowContent, ready]);

  const ingestChatText = useCallback((text) => {
    const fromChat = parseChatTasks(text);
    if (!fromChat.length) return;
    setTasks(prev => mergeTasks(prev, fromChat));
  }, []);

  const moveTask = useCallback((taskId, nextStatus) => {
    if (!KANBAN_COLUMNS.includes(nextStatus)) return;
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, status: nextStatus, updatedAt: Date.now() } : task
    ));
  }, []);

  const moveTaskToPosition = useCallback((taskId, nextStatus, toIndex) => {
    if (!KANBAN_COLUMNS.includes(nextStatus)) return;
    setTasks(prev => {
      const moving = prev.find(t => t.id === taskId);
      if (!moving) return prev;

      const others = prev.filter(t => t.id !== taskId);
      const before = [];
      const targetCol = [];
      const after = [];

      for (const task of others) {
        if (task.status !== nextStatus) {
          if (!targetCol.length) before.push(task);
          else after.push(task);
          continue;
        }
        targetCol.push(task);
      }

      const clampedIndex = Math.max(0, Math.min(toIndex, targetCol.length));
      targetCol.splice(clampedIndex, 0, {
        ...moving,
        status: nextStatus,
        updatedAt: Date.now(),
      });
      return [...before, ...targetCol, ...after];
    });
  }, []);

  const updateTaskText = useCallback((taskId, text) => {
    const cleaned = (text || "").trim();
    if (!cleaned) return;
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, text: cleaned, updatedAt: Date.now() } : task
    ));
  }, []);

  const deleteTask = useCallback((taskId) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  }, []);

  return { tasks, ready, ingestChatText, moveTask, moveTaskToPosition, updateTaskText, deleteTask };
}

function KanbanBoard({ tasks, onMoveTask, onMoveTaskToPosition, onUpdateTaskText, onDeleteTask }) {
  const [draggingId, setDraggingId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [editingText, setEditingText] = useState("");
  const byColumn = KANBAN_COLUMNS.reduce((acc, column) => {
    acc[column] = tasks.filter(task => task.status === column);
    return acc;
  }, {});

  const editingTask = tasks.find(t => t.id === editingTaskId) || null;

  function openEditor(task) {
    setEditingTaskId(task.id);
    setEditingText(task.text || "");
  }

  function closeEditor() {
    setEditingTaskId("");
    setEditingText("");
  }

  return (
    <div className="sa-kanban-wrap">
    <div className="sa-kanban">
      {KANBAN_COLUMNS.map((column) => (
        <div
          key={column}
          className="sa-kanban__column"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!draggingId) return;
            onMoveTask(draggingId, column);
            setDraggingId("");
          }}
        >
          <div className="sa-kanban__column-head">
            <span>{KANBAN_TITLES[column]}</span>
            <span>{byColumn[column].length}</span>
          </div>
          <div className="sa-kanban__cards">
            {byColumn[column].map((task, index) => (
              <div
                key={task.id}
                className="sa-kanban__card"
                draggable
                onDragStart={() => setDraggingId(task.id)}
                onDragEnd={() => setDraggingId("")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!draggingId || draggingId === task.id) return;
                  onMoveTaskToPosition(draggingId, column, index);
                  setDraggingId("");
                }}
              >
                <div className="sa-kanban__card-top">
                  <p>{task.text}</p>
                  <button
                    type="button"
                    className="sa-kanban__edit"
                    aria-label="Edit task"
                    title="Edit task"
                    onClick={() => openEditor(task)}
                  >
                    ✎
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    {editingTask && (
      <div className="sa-kanban__overlay" role="dialog" aria-modal="true" aria-label="Edit task">
        <div className="sa-kanban__overlay-panel">
          <p className="sa-kanban__overlay-title">Edit task</p>
          <textarea
            className="sa-kanban__overlay-input"
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            placeholder="Task details"
          />
          <div className="sa-kanban__overlay-actions">
            <button
              type="button"
              className="sa-kanban__overlay-btn sa-kanban__overlay-btn--danger"
              onClick={() => {
                onDeleteTask(editingTask.id);
                closeEditor();
              }}
            >
              delete
            </button>
            <button type="button" className="sa-kanban__overlay-btn" onClick={closeEditor}>cancel</button>
            <button
              type="button"
              className="sa-kanban__overlay-btn sa-kanban__overlay-btn--primary"
              onClick={() => {
                onUpdateTaskText(editingTask.id, editingText);
                closeEditor();
              }}
            >
              save
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

// ── Debug panel (logged entries only) ─────────────────────────────────────────

function DebugPanel({ onClose }) {
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
            margin: 0, letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >logged</p>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto", fontSize: 9, background: "transparent",
            border: "none", cursor: "pointer", color: "var(--color-text-tertiary)",
            fontFamily: "var(--sa-chat-font)", letterSpacing: "0.04em", padding: "4px 0",
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

// ── Settings panel (direct context file editing) ──────────────────────────────

function SettingsPanel({ onClose }) {
  const FILES = ["context.md", "now.md", "log.md"];
  const [activeFile, setActiveFile] = useState(FILES[0]);
  const [drafts, setDrafts] = useState({});
  const [loadingFile, setLoadingFile] = useState("");
  const [savingFile, setSavingFile] = useState("");
  const [status, setStatus] = useState("");

  const loadFile = useCallback(async (file) => {
    setLoadingFile(file);
    const content = await readContextFile(file);
    setDrafts(prev => ({ ...prev, [file]: content || "" }));
    setLoadingFile("");
  }, []);

  useEffect(() => {
    FILES.forEach(file => { void loadFile(file); });
  }, [loadFile]);

  async function saveActiveFile() {
    const content = drafts[activeFile] ?? "";
    setSavingFile(activeFile);
    const ok = await writeContextFile(activeFile, content, "replace");
    setSavingFile("");
    setStatus(ok ? `saved ${activeFile}` : `failed to save ${activeFile}`);
    setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sa-settings-label"
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
        boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.06)",
      }}
    >
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        marginBottom: "0.75rem",
        padding: "10px 12px",
        borderRadius: "var(--sa-composer-radius, 10px)",
        background: "var(--color-bg-panel)",
        border: "0.5px solid var(--color-border-tertiary)",
      }}>
        <p
          id="sa-settings-label"
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            margin: 0,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >settings</p>
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
            letterSpacing: "0.04em",
            padding: "4px 0",
          }}
        >close</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem" }}>
        {FILES.map((file) => {
          const isActive = activeFile === file;
          return (
            <button
              key={file}
              type="button"
              onClick={() => setActiveFile(file)}
              style={{
                border: "0.5px solid var(--color-border-secondary)",
                borderColor: isActive ? "var(--color-accent)" : "var(--color-border-secondary)",
                background: isActive ? "var(--color-bubble-user)" : "var(--color-bg)",
                color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 10,
                fontFamily: "var(--sa-chat-font)",
                cursor: "pointer",
              }}
            >
              {file}
            </button>
          );
        })}
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--sa-composer-radius, 10px)",
        background: "var(--color-bg-panel)",
        border: "0.5px solid var(--color-border-tertiary)",
        padding: "10px",
      }}>
        <textarea
          value={drafts[activeFile] ?? ""}
          onChange={e => setDrafts(prev => ({ ...prev, [activeFile]: e.target.value }))}
          style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            background: "transparent",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.55,
          }}
          placeholder={loadingFile === activeFile ? "loading..." : "empty file"}
        />
        <div style={{ display: "flex", alignItems: "center", marginTop: "0.5rem" }}>
          <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)", letterSpacing: "0.04em" }}>
            {loadingFile === activeFile ? `loading ${activeFile}...` : status || "edit and save directly"}
          </p>
          <button
            type="button"
            onClick={saveActiveFile}
            disabled={savingFile === activeFile}
            style={{
              marginLeft: "auto",
              border: "0.5px solid var(--color-border-accent)",
              background: "var(--color-bg)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 10,
              fontFamily: "var(--sa-chat-font)",
              color: "var(--color-text-primary)",
              cursor: savingFile === activeFile ? "default" : "pointer",
              opacity: savingFile === activeFile ? 0.6 : 1,
            }}
          >
            {savingFile === activeFile ? "saving..." : "save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function useIsMobile(breakpointPx = 900) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

// ── Root ──────────────────────────────────────────────────────────────────────

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
  const [kanbanNowContent, setKanbanNowContent] = useState("");
  const kanban = useKanban(kanbanNowContent);
  const { entries, submit, loading, toast, nowContent } = useDocument({ onUserMessage: kanban.ingestChatText });
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const longPressRef = useRef(null);

  useEffect(() => {
    setKanbanNowContent(nowContent || "");
  }, [nowContent]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setDebugOpen(d => !d);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onWordmarkDown() {
    longPressRef.current = setTimeout(() => setDebugOpen(d => !d), 600);
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
            letterSpacing: "0.045em",
            textTransform: "uppercase",
            cursor: "default",
            userSelect: "none",
          }}
        >studio ash</p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
            style={{
              marginLeft: "auto",
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
          {!isMobile && (
            <button
              type="button"
              onClick={() => setBoardHidden(v => !v)}
              aria-label={boardHidden ? "Show board" : "Hide board"}
              title={boardHidden ? "Show board" : "Hide board"}
              style={{
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
