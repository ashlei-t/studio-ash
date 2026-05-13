import { readContextFile, writeContextFile } from "./api.js";
import { requestClaude, extractText } from "./anthropic.js";
import { supabase } from "../../utils/supabase.js";

const ALLOWED_INBOX_FILES = new Set(["identity.md", "season.md", "thinkies.md"]);

const OBSERVER_SYSTEM = `You observe a small team's chat and their shared markdown context files.

You have:
1) Rolling memory (team_memory.md) — short dated notes of what already happened in the team.
2) identity.md, season.md, thinkies.md — the team's shared slow context, sprint board, and log-style notes.
3) A transcript of recent chat messages.

You do NOT chime in on every message. Most of the time stay silent.

When you DO speak in chat (rare): only for a clear decision, new action item, contradiction, or pattern worth naming.

You may also propose edits to the shared markdown files. Those proposals must be reviewed by a human in the inbox — never assume they were applied.

You may append a short line to team_memory.md (1–3 sentences, dated) when something worth recalling later happened — this helps you "remember" across long threads.

Reply ONLY as compact JSON (no markdown fences, no prose outside JSON):
{
  "should_post": boolean,
  "summary": string,
  "memory_append": string,
  "suggested_updates": [
    { "file": "identity.md", "mode": "replace", "content": "full file body" }
  ]
}

Rules:
- "summary" is at most 2 sentences, plain prose, for a team chat bubble. Empty if should_post is false.
- "memory_append": optional dated snippet to append to team_memory.md (use ### Weekday, D Month YYYY heading + 1–3 sentences). Empty string if nothing to add.
- "suggested_updates": array of { "file", "mode", "content" } with mode only "append" or "replace". Only touch identity.md, season.md, or thinkies.md. Use full file body for replace. Omit or use [] if nothing to propose.
- If nothing warrants a chat message, set should_post false and summary "".
- If nothing warrants inbox/file changes, use suggested_updates: [].
`;

function clip(text, max = 3500) {
  const s = (text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated…]`;
}

function parseObserverPayload(raw) {
  if (!raw) {
    return {
      should_post: false,
      summary: "",
      memory_append: "",
      suggested_updates: [],
    };
  }
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const p = JSON.parse(text);
    const suggested = Array.isArray(p.suggested_updates) ? p.suggested_updates : [];
    const clean = suggested.filter(
      (u) =>
        u &&
        ALLOWED_INBOX_FILES.has(String(u.file)) &&
        ["append", "replace"].includes(String(u.mode || "").toLowerCase()) &&
        typeof u.content === "string",
    );
    return {
      should_post: Boolean(p.should_post),
      summary: typeof p.summary === "string" ? p.summary.trim() : "",
      memory_append: typeof p.memory_append === "string" ? p.memory_append.trim() : "",
      suggested_updates: clean.map((u) => ({
        file: u.file,
        mode: String(u.mode).toLowerCase(),
        content: u.content.trim(),
      })),
    };
  } catch {
    return {
      should_post: false,
      summary: "",
      memory_append: "",
      suggested_updates: [],
    };
  }
}

function transcriptFor(messages, limit = 40) {
  const tail = messages.slice(-limit);
  return tail
    .map((m) => {
      const who = m.kind === "assistant" ? "assistant" : `user:${(m.author_id || "anon").slice(0, 6)}`;
      return `${who}: ${m.body}`;
    })
    .join("\n");
}

function buildUserBlock({ memory, identity, season, thinkies, transcript }) {
  return [
    "## team_memory.md\n",
    clip(memory || "(empty)", 2500),
    "\n\n## identity.md\n",
    clip(identity, 2500),
    "\n\n## season.md\n",
    clip(season, 3500),
    "\n\n## thinkies.md\n",
    clip(thinkies, 2500),
    "\n\n## chat (newest last)\n",
    transcript,
  ].join("");
}

export async function maybePostObserverInsight({ teamId, messages }) {
  if (!teamId) return { posted: false, reason: "missing input" };
  if (!messages?.length) return { posted: false, reason: "no messages" };

  const lastAssistantIdx = messages.findLastIndex((m) => m.kind === "assistant");
  if (lastAssistantIdx >= 0) {
    const last = messages[lastAssistantIdx];
    const ageMs = Date.now() - new Date(last.created_at).getTime();
    const humanAfter = messages.slice(lastAssistantIdx + 1).filter((m) => m.kind === "human").length;
    if (ageMs < 5 * 60 * 1000) return { posted: false, reason: "recent assistant" };
    if (humanAfter < 3) return { posted: false, reason: "few humans since" };
  }

  const [memory, identity, season, thinkies] = await Promise.all([
    readContextFile("team_memory.md"),
    readContextFile("identity.md"),
    readContextFile("season.md"),
    readContextFile("thinkies.md"),
  ]);

  const transcript = transcriptFor(messages);
  const userBlock = buildUserBlock({ memory, identity, season, thinkies, transcript });

  const response = await requestClaude({
    system: OBSERVER_SYSTEM,
    messages: [{ role: "user", content: userBlock }],
    maxTokens: 4096,
  });
  const parsed = parseObserverPayload(extractText(response));

  let memoryAppend = parsed.memory_append;

  if (memoryAppend) {
    const ok = await writeContextFile("team_memory.md", memoryAppend, "append");
    if (!ok) console.warn("[team-observer] team_memory append failed");
  }

  const suggested = parsed.suggested_updates;

  let inboxId = null;
  if (suggested.length) {
    const { data: inboxRow, error: inboxErr } = await supabase
      .from("inbox_items")
      .insert({
        scope: "team",
        team_id: teamId,
        title: "Suggested updates from team chat",
        body: "Review in the inbox and tap **accept** to merge into the team's shared files.",
        suggested_updates: suggested,
        status: "pending",
      })
      .select("id")
      .maybeSingle();
    if (inboxErr) console.warn("[team-observer] inbox insert:", inboxErr.message);
    else inboxId = inboxRow?.id ?? null;
  }

  const hasInbox = Boolean(inboxId);
  let postedChat = false;

  if (parsed.should_post && parsed.summary) {
    const { error } = await supabase.from("team_messages").insert({
      team_id: teamId,
      author_id: null,
      kind: "assistant",
      body: parsed.summary,
      has_inbox_suggestion: hasInbox,
    });
    if (error) {
      console.warn("[team-observer] chat insert failed:", error.message);
      return { posted: false, reason: error.message, inboxId };
    }
    postedChat = true;
  }

  return {
    posted: postedChat,
    summary: parsed.summary,
    inboxId,
    memoryWritten: Boolean(memoryAppend),
  };
}
