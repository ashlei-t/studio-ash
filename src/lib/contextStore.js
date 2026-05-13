import { supabase } from "../../utils/supabase.js";

const CONTEXT_FILES = ["identity.md", "season.md", "thinkies.md"];
const TEAM_ONLY_FILES = new Set(["team_memory.md"]);
const PERSONAL_ONLY_FILES = new Set(["thread_document.json"]);

function isContextFile(file) {
  if (CONTEXT_FILES.includes(file)) return true;
  if (TEAM_ONLY_FILES.has(file) && currentScope.kind === "team" && currentScope.id) return true;
  if (PERSONAL_ONLY_FILES.has(file) && currentScope.kind === "personal" && currentScope.id) return true;
  return false;
}

async function readLocal(file) {
  try {
    const res = await fetch(`/api/context/${file}`);
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

async function writeLocal(file, content, mode = "replace") {
  const res = await fetch(`/api/context/${file}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mode }),
  });
  return res.ok;
}

async function readStorage(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) {
    if (error.status === 400 || error.statusCode === "404") return "";
    if (error.message?.toLowerCase().includes("not found")) return "";
    console.warn(`[contextStore] read ${bucket}/${path}:`, error.message);
    return "";
  }
  return data ? await data.text() : "";
}

let lastWriteError = null;

export function getLastWriteError() {
  return lastWriteError;
}

async function writeStorage(bucket, path, content, mode = "replace") {
  let nextContent = content;
  if (mode === "append") {
    const cur = await readStorage(bucket, path);
    nextContent = cur ? `${cur}\n${content}` : content;
  }
  const contentType = path.endsWith(".json") ? "application/json" : "text/markdown";
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, new Blob([nextContent], { type: contentType }), {
      upsert: true,
      contentType,
    });
  if (error) {
    lastWriteError = { bucket, path, message: error.message, status: error.statusCode || error.status };
    console.warn(`[contextStore] write ${bucket}/${path}:`, error);
    return false;
  }
  lastWriteError = null;
  return true;
}

let currentUserId = null;
let currentScope = { kind: "personal", id: null };

export function setContextUser(userId) {
  currentUserId = userId || null;
  if (!userId) {
    currentScope = { kind: "personal", id: null };
    return;
  }
  if (currentScope.kind === "personal") {
    currentScope = { kind: "personal", id: userId };
  }
}

export function setContextScope(scope) {
  if (!scope || scope.kind === "personal") {
    currentScope = { kind: "personal", id: currentUserId };
    return;
  }
  if (scope.kind === "team" && scope.id) {
    currentScope = { kind: "team", id: scope.id };
  }
}

function resolveLocation(file) {
  if (!isContextFile(file)) return null;
  // Personal-only files (thread_document.json) always live in the user's
  // private bucket, even when the team scope is active.
  if (PERSONAL_ONLY_FILES.has(file)) {
    if (!currentUserId) return null;
    return { bucket: "context", path: `${currentUserId}/${file}` };
  }
  if (currentScope.kind === "team" && currentScope.id) {
    return { bucket: "team", path: `${currentScope.id}/${file}` };
  }
  if (currentScope.kind === "personal" && currentScope.id) {
    return { bucket: "context", path: `${currentScope.id}/${file}` };
  }
  return null;
}

export async function readContext(file) {
  const loc = resolveLocation(file);
  if (loc) return readStorage(loc.bucket, loc.path);
  return readLocal(file);
}

export async function writeContext(file, content, mode = "replace") {
  const loc = resolveLocation(file);
  if (loc) return writeStorage(loc.bucket, loc.path, content, mode);
  return writeLocal(file, content, mode);
}

export { CONTEXT_FILES };
