import { useEffect, useState } from "react";
import { AssistantMarkdown } from "../AssistantMarkdown.jsx";
import { readContextFile } from "../lib/api.js";
import { getTodayLogEntries } from "../lib/log.js";

export function DayView() {
  const [entries, setEntries] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function load() {
      readContextFile("log.md").then((log) => {
        if (cancelled) return;
        setEntries(getTodayLogEntries(log, new Date()));
        setReady(true);
      });
    }

    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {!ready && (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0 }}>···</p>
      )}

      {ready && entries.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0, fontStyle: "italic" }}>
          nothing logged yet today.
        </p>
      )}

      {entries.map((entry, i) => (
        <div key={i} style={{ marginBottom: "1.1rem" }}>
          {i > 0 && <div style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", margin: "0 0 0.9rem" }} />}
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--color-text-primary)", fontFamily: "var(--sa-chat-font)" }}>
            <AssistantMarkdown>{entry}</AssistantMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}
