import { readContextFile } from "./api.js";
import { requestClaude, extractText } from "./anthropic.js";
import { supabase } from "../../utils/supabase.js";

const ALLOWED_INBOX_FILES = new Set(["identity.md", "season.md", "thinkies.md"]);

const OBSERVER_SYSTEM = `You observe a single user's chat with their daily-companion assistant and their three markdown context files.

You have:
1) identity.md — slow-moving facts about who they are.
2) season.md — the current season's priorities and a small kanban board.
3) thinkies.md — a dated journal/log.
4) A transcript of the most recent chat exchanges.

The chat is already merging small inline updates as the user goes. Your job is the *organizational layer*: propose edits the user should explicitly confirm before they happen — pruning, reorganizing, consolidating, or renaming. Most of the time stay silent.

Reply ONLY as compact JSON (no markdown fences, no prose outside JSON):
{
  "title": string,
  "body": string,
  "suggested_updates": [
    { "file": "identity.md", "mode": "replace", "content": "full file body" }
  ]
}

Rules:
- "title": short imperative phrase shown in the inbox (e.g. "tidy thinkies.md", "refine identity.md"). Empty string if there is nothing to propose.
- "body": 1–2 sentences explaining *why* the user should approve. Empty if no proposal.
- "suggested_updates": array of { "file", "mode", "content" } with mode "append" or "replace". Only touch identity.md, season.md, or thinkies.md. For replace, include the full file body. Use [] if nothing to propose.
- If nothing structural is worth proposing right now, return: { "title": "", "body": "", "suggested_updates": [] }.
- Never propose trivial edits the chat would have already applied inline.
`;

function clip(text, max = 3500) {
  const s = (text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated…]`;
}

function parsePayload(raw) {
  const empty = { title: "", body: "", suggested_updates: [] };
  if (!raw) return empty;
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
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
      title: typeof p.title === "string" ? p.title.trim() : "",
      body: typeof p.body === "string" ? p.body.trim() : "",
      suggested_updates: clean.map((u) => ({
        file: u.file,
        mode: String(u.mode).toLowerCase(),
        content: u.content.trim(),
      })),
    };
  } catch {
    return empty;
  }
}

function transcriptFor(entries, limit = 20) {
  const tail = entries.slice(-limit);
  return tail
    .map((e) => {
      const parts = [];
      if (e.text) parts.push(`user: ${e.text}`);
      if (e.response) parts.push(`assistant: ${e.response}`);
      return parts.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildUserBlock({ identity, season, thinkies, transcript }) {
  return [
    "## identity.md\n",
    clip(identity, 2500),
    "\n\n## season.md\n",
    clip(season, 3500),
    "\n\n## thinkies.md\n",
    clip(thinkies, 3500),
    "\n\n## chat (newest last)\n",
    transcript,
  ].join("");
}

export async function maybeProposePersonalUpdates({ userId, entries }) {
  if (!userId) return { proposed: false, reason: "no user" };
  if (!entries?.length) return { proposed: false, reason: "no entries" };

  // Only run when there is a meaningful exchange to evaluate.
  const exchanges = entries.filter((e) => e.text && e.response).length;
  if (exchanges < 2) return { proposed: false, reason: "too few exchanges" };

  const [identity, season, thinkies] = await Promise.all([
    readContextFile("identity.md"),
    readContextFile("season.md"),
    readContextFile("thinkies.md"),
  ]);

  const transcript = transcriptFor(entries);
  const userBlock = buildUserBlock({ identity, season, thinkies, transcript });

  const response = await requestClaude({
    system: OBSERVER_SYSTEM,
    messages: [{ role: "user", content: userBlock }],
    maxTokens: 4096,
  });
  const parsed = parsePayload(extractText(response));

  if (!parsed.suggested_updates.length) {
    return { proposed: false, reason: "nothing to propose" };
  }

  const { data, error } = await supabase
    .from("inbox_items")
    .insert({
      scope: "personal",
      user_id: userId,
      title: parsed.title || "Suggested updates from your chat",
      body: parsed.body || "Review and tap **accept** to merge into your context files.",
      suggested_updates: parsed.suggested_updates,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[personal-observer] inbox insert:", error.message);
    return { proposed: false, reason: error.message };
  }

  return { proposed: true, inboxId: data?.id ?? null };
}
