// Supabase Edge Function: proxies authenticated Claude calls to Anthropic.
//
// Deploy with:
//   supabase functions deploy anthropic
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
//
// The function uses the project's verify_jwt default, so callers must include
// the user's access token; unauthenticated requests are rejected before the
// function runs.

// Minimal Deno typing so the file lints cleanly outside the Supabase CLI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(name: string): string | undefined } };

const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_CEILING = 8192;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMessageArray(value: any): value is { role: string; content: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof m.role === "string" &&
        typeof m.content === "string",
    )
  );
}

// @ts-expect-error - Deno provides addEventListener at the global scope.
addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(handle(event.request));
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: { message: "method not allowed" } }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: { message: "ANTHROPIC_API_KEY not configured" } }, 500);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: "invalid JSON body" } }, 400);
  }

  const body = payload as {
    system?: unknown;
    messages?: unknown;
    max_tokens?: unknown;
    model?: unknown;
  };

  if (typeof body.system !== "string" || !body.system.trim()) {
    return json({ error: { message: "system prompt required" } }, 400);
  }
  if (!isMessageArray(body.messages) || body.messages.length === 0) {
    return json({ error: { message: "messages must be a non-empty array" } }, 400);
  }

  const model =
    typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
      ? body.model
      : DEFAULT_MODEL;
  const maxTokens =
    typeof body.max_tokens === "number" && body.max_tokens > 0
      ? Math.min(body.max_tokens, MAX_TOKENS_CEILING)
      : 2048;

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: body.system,
      messages: body.messages,
    }),
  });

  const data = await upstream.json().catch(() => ({
    error: { message: `upstream ${upstream.status}` },
  }));

  return json(data, upstream.ok ? 200 : upstream.status);
}
