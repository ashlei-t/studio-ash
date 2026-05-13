import { useEffect, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { getLastWriteError, writeContext } from "../lib/contextStore.js";
import { useAuth } from "./useAuth.js";

const STEPS = [
  {
    file: "identity.md",
    title: "identity",
    blurb:
      "Slow-moving background about you — who you are, what you're building, the people and tools around you. Studio Ash uses this to understand the bigger picture across every chat.",
    placeholder:
      "I'm Ash. I run CRI and Pokebudz. Based in Barcelona. Boxing twice a week. Daniela is my partner...",
  },
  {
    file: "season.md",
    title: "season",
    blurb:
      "What you're working on right now — current projects, sprints, deadlines, the kanban board. This changes week to week.",
    placeholder:
      "## current focus\n- Ship Studio Ash v2\n- CRI April invoices\n\n## kanban board\n### todos\n- [ ] ...",
  },
  {
    file: "thinkies.md",
    title: "thinkies",
    blurb:
      "Your running journal — dated field notes the assistant appends to over time. You can leave this empty and it'll fill in as you write.",
    placeholder: "",
  },
];

export function Onboarding({ onDone }) {
  const { user, refreshProfile } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDrafts((prev) => ({
      identity: prev.identity ?? "",
      season: prev.season ?? "",
      thinkies: prev.thinkies ?? "",
    }));
  }, []);

  const step = STEPS[stepIndex];
  const fileKey = step.file.replace(".md", "");
  const isLast = stepIndex === STEPS.length - 1;

  async function finish() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      for (const s of STEPS) {
        const key = s.file.replace(".md", "");
        const content = (drafts[key] ?? "").trim();
        if (!content) continue;
        const ok = await writeContext(s.file, content, "replace");
        if (!ok) {
          const detail = getLastWriteError();
          const tail = detail?.message ? ` — ${detail.message}` : "";
          throw new Error(`failed to save ${s.file}${tail}`);
        }
      }
      const { error: upErr } = await supabase
        .from("profiles")
        .upsert({ id: user.id, onboarding_completed_at: new Date().toISOString() });
      if (upErr) throw new Error(upErr.message);

      const welcomeTitle = "Welcome to your inbox";
      const { data: existingWelcome } = await supabase
        .from("inbox_items")
        .select("id")
        .eq("scope", "personal")
        .eq("user_id", user.id)
        .eq("title", welcomeTitle)
        .maybeSingle();
      if (!existingWelcome) {
        const body =
          "This is where Claude will queue **insights**, **log ideas**, and **action items** for you to approve. Nothing changes in your `identity.md`, `season.md`, or `thinkies.md` until you tap **accept** — then the app applies the suggested edits the same way as in chat.\n\n" +
          "You can **dismiss** anything that does not feel right. This inbox is very beta — treat it as a scratch pad between you and the assistant.";
        await supabase.from("inbox_items").insert({
          scope: "personal",
          user_id: user.id,
          title: welcomeTitle,
          body,
          suggested_updates: [],
          status: "pending",
        });
      }

      await refreshProfile();
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (isLast) return finish();
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "2rem 1.25rem",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-logo)",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
              letterSpacing: "var(--type-track-display)",
              textTransform: "uppercase",
            }}
          >
            ***
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              letterSpacing: "var(--type-track-label)",
              textTransform: "uppercase",
            }}
          >
            setup · {stepIndex + 1} / {STEPS.length}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 16,
              color: "var(--color-text-primary)",
              fontFamily: "var(--sa-chat-font)",
              fontWeight: 500,
            }}
          >
            {step.title}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "var(--color-text-secondary)",
              lineHeight: 1.55,
            }}
          >
            {step.blurb}
          </p>
        </div>

        <textarea
          value={drafts[fileKey] ?? ""}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [fileKey]: e.target.value }))}
          placeholder={step.placeholder}
          style={{
            flex: 1,
            minHeight: 280,
            resize: "vertical",
            padding: "12px 14px",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--sa-composer-radius)",
            background: "var(--color-bg-panel)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.55,
            outline: "none",
          }}
        />

        {error && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-danger)" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={back}
              disabled={saving}
              style={{
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-bg)",
                color: "var(--color-text-secondary)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 11,
                fontFamily: "var(--sa-chat-font)",
                cursor: saving ? "default" : "pointer",
              }}
            >
              back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={saving}
            style={{
              marginLeft: "auto",
              border: "0.5px solid var(--color-border-accent)",
              background: "var(--color-bg)",
              color: "var(--color-text-primary)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 11,
              fontFamily: "var(--sa-chat-font)",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "saving..." : isLast ? "finish" : "next"}
          </button>
        </div>
      </div>
    </div>
  );
}
