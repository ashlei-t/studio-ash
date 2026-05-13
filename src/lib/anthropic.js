import { supabase } from "../../utils/supabase.js";

// One transport for every Claude call in the app.
//
// Behaviour:
// - If VITE_ANTHROPIC_API_KEY is set (dev / local), call the Vite-proxied
//   Anthropic endpoint directly with the bundled key.
// - Otherwise, call the `anthropic` Supabase Edge Function, which holds the
//   real key server-side and authenticates the user via their Supabase JWT.
//
// Always resolves to an Anthropic-shaped response: { content: [{text}], error? }.

const DEV_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function requestClaude({ system, messages, maxTokens = 2048, model = DEFAULT_MODEL }) {
  if (DEV_KEY) {
    try {
      const res = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": DEV_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      });
      return await res.json();
    } catch (e) {
      return { error: { message: e.message } };
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke("anthropic", {
      body: { system, messages, max_tokens: maxTokens, model },
    });
    if (error) return { error: { message: error.message } };
    return data;
  } catch (e) {
    return { error: { message: e.message } };
  }
}

export function extractText(response) {
  return response?.content?.[0]?.text || response?.error?.message || "";
}
