import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth.js";
import { callClaude, readContextFile, writeContextFile } from "../lib/api.js";
import { applyContextUpdates } from "../lib/applyUpdates.js";
import { parseResponse, stripUpdateSyntaxFromVisibleText } from "../lib/contextUpdates.js";
import { maybeProposePersonalUpdates } from "../lib/personalObserver.js";
import { CONTEXT_INSTRUCTIONS, PROMPT_MAP } from "../lib/prompts.js";
import { getTimeSlot, isSameCalendarDay } from "../lib/time.js";
import { useScope } from "../scope/useScope.js";

const DOC_FILE = "thread_document.json";
const OBSERVER_DEBOUNCE_MS = 20_000;

export function useDocument() {
  const { user } = useAuth();
  const { scope, scopeVersion } = useScope();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState({ identity: "", season: "", thinkies: "" });
  const [toast, setToast] = useState("");
  const observerTimerRef = useRef(null);
  const observerRunningRef = useRef(false);

  const loadContext = useCallback(async () => {
    const [identity, season, thinkies] = await Promise.all([
      readContextFile("identity.md"),
      readContextFile("season.md"),
      readContextFile("thinkies.md"),
    ]);
    setCtx({ identity, season, thinkies });
  }, []);

  useEffect(() => {
    setEntries([]);
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
  }, [loadContext, scopeVersion]);

  // Cancel any pending observer run when scope changes or component unmounts.
  useEffect(() => {
    return () => {
      if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    };
  }, [scopeVersion]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleUpdates(updates) {
    const updated = await applyContextUpdates(updates);
    if (updated.length) {
      await loadContext();
      showToast(`updated: ${updated.join(", ")}`);
    }
  }

  function scheduleObserver(nextEntries) {
    if (scope.kind !== "personal" || !user?.id) return;
    if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
    observerTimerRef.current = setTimeout(async () => {
      if (observerRunningRef.current) return;
      observerRunningRef.current = true;
      try {
        await maybeProposePersonalUpdates({ userId: user.id, entries: nextEntries });
      } finally {
        observerRunningRef.current = false;
      }
    }, OBSERVER_DEBOUNCE_MS);
  }

  function buildSystemPrompt(slot) {
    const parts = [PROMPT_MAP[slot] || PROMPT_MAP.morning];
    if (ctx.identity) parts.push(`\n## Identity (identity.md)\n${ctx.identity}`);
    if (ctx.season) parts.push(`\n## Current season (season.md)\n${ctx.season}`);
    if (ctx.thinkies) parts.push(`\n## Thinkies (thinkies.md)\n${ctx.thinkies}`);
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
        const safeDisplayText = stripUpdateSyntaxFromVisibleText(displayText);
        const final = next.map((e, i) =>
          i === next.length - 1 ? { ...e, response: safeDisplayText } : e,
        );
        setEntries(final);
        await writeContextFile(DOC_FILE, JSON.stringify(final), "replace");
        await handleUpdates(updates);
        scheduleObserver(final);
      } finally {
        setLoading(false);
      }
    });
  }

  return { entries, submit, loading, toast, seasonContent: ctx.season };
}
