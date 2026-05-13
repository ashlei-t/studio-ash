import { useCallback, useEffect, useRef, useState } from "react";
import { readContextFile, writeContextFile } from "../lib/api.js";
import { useAuth } from "../auth/useAuth.js";

const FILES = ["identity.md", "season.md", "thinkies.md"];

export function SettingsPanel({ onClose }) {
  const { user, signOut } = useAuth();
  const [activeFile, setActiveFile] = useState(FILES[0]);
  const [drafts, setDrafts] = useState({});
  const [loadingFile, setLoadingFile] = useState("");
  const [savingFile, setSavingFile] = useState("");
  const [status, setStatus] = useState("");
  const [changedFiles, setChangedFiles] = useState({});
  const lastLoadedRef = useRef({});

  const loadFile = useCallback(async (file, { silent = false } = {}) => {
    if (!silent) setLoadingFile(file);
    const content = await readContextFile(file);
    const nextContent = content || "";
    const prevLoaded = lastLoadedRef.current[file];
    if (typeof prevLoaded === "string" && prevLoaded !== nextContent) {
      setChangedFiles((prev) => ({ ...prev, [file]: true }));
    }
    lastLoadedRef.current[file] = nextContent;
    setDrafts((prev) => {
      // Do not clobber active unsaved edits while polling for external updates.
      if (silent && file === activeFile && prev[file] !== prevLoaded) return prev;
      return { ...prev, [file]: nextContent };
    });
    if (!silent) setLoadingFile("");
  }, [activeFile]);

  const pollFiles = useCallback(async () => {
    await Promise.all(FILES.map((file) => loadFile(file, { silent: true })));
  }, [loadFile]);

  useEffect(() => {
    FILES.forEach((file) => { void loadFile(file); });
  }, [loadFile]);

  useEffect(() => {
    const id = setInterval(() => { void pollFiles(); }, 5000);
    return () => clearInterval(id);
  }, [pollFiles]);

  async function saveActiveFile() {
    const content = drafts[activeFile] ?? "";
    setSavingFile(activeFile);
    const ok = await writeContextFile(activeFile, content, "replace");
    setSavingFile("");
    setStatus(ok ? `saved ${activeFile}` : `failed to save ${activeFile}`);
    if (ok) {
      lastLoadedRef.current[activeFile] = content;
      setChangedFiles((prev) => ({ ...prev, [activeFile]: false }));
    }
    setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sa-settings-label"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 110,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "0.75rem 1.25rem max(1rem, env(safe-area-inset-bottom))",
        background: "var(--color-bg)",
        boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.06)",
      }}
    >
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        marginBottom: "0.75rem",
        padding: "10px 12px",
        borderRadius: "var(--sa-composer-radius, 10px)",
        background: "var(--color-bg-panel)",
        border: "0.5px solid var(--color-border-tertiary)",
      }}>
        <p
          id="sa-settings-label"
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            margin: 0,
            letterSpacing: "var(--type-track-label)",
            textTransform: "uppercase",
          }}
        >settings</p>
        {user && (
          <p
            style={{
              margin: "0 0 0 8px",
              fontSize: 9,
              color: "var(--color-text-tertiary)",
              letterSpacing: "var(--type-track-meta)",
            }}
          >
            {user.email}
          </p>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            marginLeft: "auto",
            fontSize: 9,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            fontFamily: "var(--sa-chat-font)",
            letterSpacing: "var(--type-track-meta)",
            padding: "4px 8px 4px 0",
          }}
        >sign out</button>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 9,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            fontFamily: "var(--sa-chat-font)",
            letterSpacing: "var(--type-track-meta)",
            padding: "4px 0",
          }}
        >close</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem" }}>
        {FILES.map((file) => {
          const isActive = activeFile === file;
          return (
            <button
              key={file}
              type="button"
              onClick={() => setActiveFile(file)}
              style={{
                border: "0.5px solid var(--color-border-secondary)",
                borderColor: isActive ? "var(--color-accent)" : "var(--color-border-secondary)",
                background: isActive ? "var(--color-bubble-user)" : "var(--color-bg)",
                color: changedFiles[file]
                  ? "var(--color-text-danger)"
                  : (isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)"),
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 10,
                fontFamily: "var(--sa-chat-font)",
                cursor: "pointer",
              }}
            >
              {file}
            </button>
          );
        })}
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--sa-composer-radius, 10px)",
        background: "var(--color-bg-panel)",
        border: "0.5px solid var(--color-border-tertiary)",
        padding: "10px",
      }}>
        <textarea
          value={drafts[activeFile] ?? ""}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [activeFile]: e.target.value }))}
          style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            background: "transparent",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.55,
          }}
          placeholder={loadingFile === activeFile ? "loading..." : "empty file"}
        />
        <div style={{ display: "flex", alignItems: "center", marginTop: "0.5rem" }}>
          <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)", letterSpacing: "var(--type-track-meta)" }}>
            {loadingFile === activeFile ? `loading ${activeFile}...` : status || "edit and save directly"}
          </p>
          <button
            type="button"
            onClick={saveActiveFile}
            disabled={savingFile === activeFile}
            style={{
              marginLeft: "auto",
              border: "0.5px solid var(--color-border-accent)",
              background: "var(--color-bg)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 10,
              fontFamily: "var(--sa-chat-font)",
              color: "var(--color-text-primary)",
              cursor: savingFile === activeFile ? "default" : "pointer",
              opacity: savingFile === activeFile ? 0.6 : 1,
            }}
          >
            {savingFile === activeFile ? "saving..." : "save"}
          </button>
        </div>
      </div>
    </div>
  );
}
