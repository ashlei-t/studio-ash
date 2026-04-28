export async function callClaude(systemPrompt, messages, onResult) {
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

export async function readContextFile(file) {
  try {
    const res = await fetch(`/api/context/${file}`);
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

export async function writeContextFile(file, content, mode = "replace") {
  const res = await fetch(`/api/context/${file}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mode }),
  });
  return res.ok;
}
