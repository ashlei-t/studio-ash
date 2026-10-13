// Supabase Edge Function: reflect on one journal entry.
//
// The client calls this after an entry has synced. The function:
//   1. reads the entry, memory, and recent entries AS THE CALLER (their JWT,
//      so row-level security applies — it can only ever see the caller's rows),
//   2. asks Claude for an optional one-line reply plus memory updates,
//   3. writes the memory updates and the reply back.
//
// It is idempotent: calling it again for an entry that was already reflected
// returns the stored reply without another Claude call.
//
// Deploy:
//   supabase functions deploy reflect
//   supabase secrets set ANTHROPIC_API_KEY=...

import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompt.ts";

const MODEL = "claude-opus-5-5";
const RECENT_ENTRIES = 20;
const EVERYDAY_LINES = 120;
const TIERS = ["long", "short", "everyday"] as const;
type Tier = (typeof TIERS)[number];

// v1 kept memory as markdown files in Storage. On first run we seed the new
// tiers from them so nothing Ash built up is lost.
const V1_FILES: Record<Tier, string> = {
  long: "identity.md",
  short: "season.md",
  everyday: "thinkies.md",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type Reflection = { reply: string; everyday_line: string; short: string; long: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "not signed in" }, 401);

  let entryId: string, timeZone: string;
  try {
    const body = await req.json();
    entryId = String(body.entry_id);
    timeZone = typeof body.time_zone === "string" ? body.time_zone : "UTC";
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "not signed in" }, 401);
  const userId = userData.user.id;

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .select("id, body, created_at, reply, reflected_at")
    .eq("id", entryId)
    .maybeSingle();
  if (entryError) return json({ error: entryError.message }, 500);
  if (!entry) return json({ error: "entry not found" }, 404);
  if (entry.reflected_at) return json({ reply: entry.reply ?? "" });

  const memory = await loadMemory(supabase, userId);

  const { data: recent, error: recentError } = await supabase
    .from("entries")
    .select("body, created_at")
    .neq("id", entryId)
    .lt("created_at", entry.created_at)
    .order("created_at", { ascending: false })
    .limit(RECENT_ENTRIES);
  if (recentError) return json({ error: recentError.message }, 500);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone, weekday: "short", year: "numeric", month: "short", day: "numeric",
    });

  const everydayTail = memory.everyday.split("\n").slice(-EVERYDAY_LINES).join("\n");
  const recentText = (recent ?? [])
    .reverse()
    .map((e) => `### ${fmt(e.created_at)}\n${e.body}`)
    .join("\n\n");

  const userContent = [
    `<long_term_memory>\n${memory.long || "(empty)"}\n</long_term_memory>`,
    `<short_term_memory>\n${memory.short || "(empty)"}\n</short_term_memory>`,
    `<everyday_log>\n${everydayTail || "(empty)"}\n</everyday_log>`,
    `<recent_entries>\n${recentText || "(none yet)"}\n</recent_entries>`,
    `<new_entry date="${fmt(entry.created_at)}">\n${entry.body}\n</new_entry>`,
  ].join("\n\n");

  let reflection: Reflection;
  try {
    reflection = await askClaude(userContent);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate limited" }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `claude ${e.status}: ${e.message}` }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  const dateStamp = new Date(entry.created_at).toLocaleDateString("en-CA", { timeZone }); // YYYY-MM-DD
  const updates: { tier: Tier; content: string }[] = [];
  if (reflection.everyday_line.trim()) {
    const line = `- ${dateStamp}: ${reflection.everyday_line.trim()}`;
    updates.push({
      tier: "everyday",
      content: memory.everyday.trim() ? `${memory.everyday.trimEnd()}\n${line}` : line,
    });
  }
  if (reflection.short.trim()) updates.push({ tier: "short", content: reflection.short.trim() });
  if (reflection.long.trim()) updates.push({ tier: "long", content: reflection.long.trim() });

  for (const u of updates) {
    const { error } = await supabase
      .from("memory")
      .update({ content: u.content })
      .eq("user_id", userId)
      .eq("tier", u.tier);
    if (error) return json({ error: error.message }, 500);
  }

  const reply = reflection.reply.trim();
  const { error: saveError } = await supabase
    .from("entries")
    .update({ reply: reply || null, reflected_at: new Date().toISOString() })
    .eq("id", entryId);
  if (saveError) return json({ error: saveError.message }, 500);

  return json({ reply });
});

async function askClaude(userContent: string): Promise<Reflection> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") throw new Error("claude declined this entry");
  if (response.stop_reason === "max_tokens") throw new Error("claude response was cut off");

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const parsed = JSON.parse(text) as Reflection;
  return parsed;
}

async function loadMemory(supabase: SupabaseClient, userId: string): Promise<Record<Tier, string>> {
  const { data, error } = await supabase.from("memory").select("tier, content");
  if (error) throw error;

  const memory = { long: "", short: "", everyday: "" } as Record<Tier, string>;
  for (const row of data ?? []) memory[row.tier as Tier] = row.content;
  if ((data ?? []).length === TIERS.length) return memory;

  // First run: create the missing tiers, seeded from v1 Storage files.
  const have = new Set((data ?? []).map((r) => r.tier));
  for (const tier of TIERS) {
    if (have.has(tier)) continue;
    memory[tier] = await readV1File(supabase, `${userId}/${V1_FILES[tier]}`);
    const { error: insertError } = await supabase
      .from("memory")
      .insert({ user_id: userId, tier, content: memory[tier] });
    if (insertError && insertError.code !== "23505") throw insertError; // ignore duplicate
  }
  return memory;
}

async function readV1File(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("context").download(path);
  if (error || !data) return "";
  return (await data.text()).trim();
}
