import { requestClaude, extractText } from "./anthropic.js";
import { readContext, writeContext } from "./contextStore.js";

export async function callClaude(systemPrompt, messages, onResult) {
  const response = await requestClaude({ system: systemPrompt, messages });
  onResult(extractText(response));
}

export function readContextFile(file) {
  return readContext(file);
}

export function writeContextFile(file, content, mode = "replace") {
  return writeContext(file, content, mode);
}
