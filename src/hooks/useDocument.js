import { useCallback, useEffect, useState } from "react";
import { callClaude, readContextFile, writeContextFile } from "../lib/api.js";
import { parseResponse } from "../lib/contextUpdates.js";
import {
  mergeBoardTasksPreferExisting,
  mergeKanbanIntoNow,
  parseNowTasks,
} from "../lib/kanban.js";
import { upsertLogEntry } from "../lib/log.js";
import { CONTEXT_INSTRUCTIONS, PROMPT_MAP } from "../lib/prompts.js";
import { getTimeSlot, isSameCalendarDay } from "../lib/time.js";

const DOC_FILE = "thread_document.json";

export function useDocument() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState({ context: "", now: "", log: "" });
  const [toast, setToast] = useState("");

  const loadContext = useCallback(async () => {
    const [context, now, log] = await Promise.all([
      readContextFile("context.md"),
      readContextFile("now.md"),
      readContextFile("log.md"),
    ]);
    setCtx({ context, now, log });
  }, []);

  useEffect(() => {
    loadContext();
    readContextFile(DOC_FILE).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        const last = parsed[parsed.length - 1];
        if (last?.ts && isSameCalendarDay(new Date(last.ts), new Date())) {
          setEntries(parsed);
        }
      } catch {
        /* start fresh */
      }
    });
  }, [loadContext]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleUpdates(updates) {
    if (!updates.length) return;
    const updated = [];
    for (const { file, content, mode } of updates) {
      if (mode === "replace" && file === "now.md") {
        const curNow = await readContextFile("now.md");
        const existingBoardTasks = parseNowTasks(curNow);
        const incomingBoardTasks = parseNowTasks(content);
        const mergedBoardTasks = mergeBoardTasksPreferExisting(
          existingBoardTasks,
          incomingBoardTasks,
        );
        const mergedNow = mergedBoardTasks.length
          ? mergeKanbanIntoNow(content, mergedBoardTasks)
          : content;
        const ok = await writeContextFile(file, mergedNow, "replace");
        if (ok) updated.push(file);
        continue;
      }
      if (mode === "append" && file === "log.md") {
        const cur = await readContextFile(file);
        const merged = upsertLogEntry(cur, content);
        if (!merged.changed || !merged.next) continue;
        const ok = await writeContextFile(file, merged.next, "replace");
        if (ok) updated.push(file);
        continue;
      }
      const ok = await writeContextFile(file, content, mode);
      if (ok) updated.push(file);
    }
    if (updated.length) {
      await loadContext();
      showToast(`updated: ${[...new Set(updated)].join(", ")}`);
    }
  }

  function buildSystemPrompt(slot) {
    const parts = [PROMPT_MAP[slot] || PROMPT_MAP.morning];
    if (ctx.context) parts.push(`\n## Personal context\n${ctx.context}`);
    if (ctx.now) parts.push(`\n## Current sprint (now.md)\n${ctx.now}`);
    if (ctx.log) parts.push(`\n## Log (log.md)\n${ctx.log}`);
    parts.push(CONTEXT_INSTRUCTIONS);
    return parts.join("\n");
  }

  function submit(text) {
    const content = text.trim();
    if (!content || loading) return;
    const slot = getTimeSlot(new Date().getHours());
    const entry = { slot, text: content, ts: Date.now(), response: null };
    const next = [...entries, entry];
    setEntries(next);
    setLoading(true);

    const messages = next
      .filter((e) => e.text)
      .flatMap((e) => {
        const out = [{ role: "user", content: e.text }];
        if (e.response) out.push({ role: "assistant", content: e.response });
        return out;
      });

    callClaude(buildSystemPrompt(slot), messages, async (raw) => {
      try {
        const { displayText, updates } = parseResponse(raw);
        const final = next.map((e, i) =>
          i === next.length - 1 ? { ...e, response: displayText } : e,
        );
        setEntries(final);
        await writeContextFile(DOC_FILE, JSON.stringify(final), "replace");
        await handleUpdates(updates);
      } finally {
        setLoading(false);
      }
    });
  }

  return { entries, submit, loading, toast, nowContent: ctx.now };
}
