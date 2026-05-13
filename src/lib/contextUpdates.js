const UPDATE_RE =
  /---UPDATE:([\w.]+):(append|replace)---([\s\S]*?)---\s*END(?:\s*---|\s*$)/gi;

// Defensive cleanup for cases where the model emits malformed update blocks.
// This ensures update syntax never leaks into visible chat text.
const UPDATE_BLOCK_START_LINE_RE = /^\s*---UPDATE:[\w.]+:(?:append|replace)---\s*$/im;
const ALL_UPDATE_BLOCKS_RE =
  /^\s*---UPDATE:[\w.]+:(?:append|replace)---[\s\S]*?(?:^\s*---\s*END(?:\s*---)?\s*$|$)/gim;
const ORPHAN_UPDATE_MARKER_LINES_RE =
  /^\s*---(?:UPDATE:[\w.]+:(?:append|replace)|\s*END(?:\s*---)?)---\s*$/gim;
const INLINE_UPDATE_START_RE = /---UPDATE:[\w.]+:(?:append|replace)---/i;
const ANY_UPDATE_TO_END_RE = /(^|\n)\s*---UPDATE:[\w.]+:(?:append|replace)---[\s\S]*$/i;

export function stripUpdateSyntaxFromVisibleText(text) {
  if (!text) return "";
  let displayText = String(text);
  const firstUpdateIdx = displayText.search(/---UPDATE:/i);
  if (firstUpdateIdx >= 0) {
    displayText = displayText.slice(0, firstUpdateIdx);
  }
  displayText = displayText.replace(UPDATE_RE, "");
  if (UPDATE_BLOCK_START_LINE_RE.test(displayText)) {
    displayText = displayText.replace(ALL_UPDATE_BLOCKS_RE, "");
  }
  if (ANY_UPDATE_TO_END_RE.test(displayText)) {
    displayText = displayText.replace(ANY_UPDATE_TO_END_RE, "$1");
  }
  if (INLINE_UPDATE_START_RE.test(displayText)) {
    displayText = displayText.replace(/---UPDATE:[\s\S]*$/i, "");
  }
  return displayText
    .replace(ORPHAN_UPDATE_MARKER_LINES_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseResponse(text) {
  const updates = [];
  UPDATE_RE.lastIndex = 0;
  let match;
  while ((match = UPDATE_RE.exec(text)) !== null) {
    updates.push({ file: match[1], mode: match[2].toLowerCase(), content: match[3].trim() });
  }
  UPDATE_RE.lastIndex = 0;
  const displayText = stripUpdateSyntaxFromVisibleText(text);
  return { displayText, updates };
}
