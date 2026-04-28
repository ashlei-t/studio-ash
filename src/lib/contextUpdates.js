const UPDATE_RE =
  /---UPDATE:([\w.]+):(append|replace)---([\s\S]*?)---\s*END(?:\s*---|\s*$)/g;

export function parseResponse(text) {
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
