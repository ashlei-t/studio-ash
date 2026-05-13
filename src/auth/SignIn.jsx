import { useEffect, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { stashPendingInviteFromUrl, readPendingInviteToken } from "../lib/pendingInvite.js";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    stashPendingInviteFromUrl();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setError("");
    const join = readPendingInviteToken();
    const redirectTo = join ? `${window.location.origin}/?join=${join}` : window.location.origin;
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });
    if (err) {
      setStatus("idle");
      setError(err.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.25rem",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 320,
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
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
              fontSize: 12,
              color: "var(--color-text-secondary)",
              letterSpacing: "var(--type-track-ui)",
            }}
          >
            sign in to studio ash
          </p>
        </div>

        {status === "sent" ? (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            check <strong style={{ color: "var(--color-text-primary)" }}>{email}</strong> for a magic link.
          </p>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                border: "var(--sa-composer-border)",
                borderRadius: "var(--sa-composer-radius)",
                background: "var(--sa-composer-bg)",
                padding: "10px 12px",
                fontFamily: "var(--sa-chat-font)",
                fontSize: 12,
                color: "var(--color-text-primary)",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                border: "0.5px solid var(--color-border-accent)",
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                borderRadius: "var(--sa-composer-radius)",
                padding: "10px 12px",
                fontFamily: "var(--sa-chat-font)",
                fontSize: 12,
                cursor: status === "sending" ? "default" : "pointer",
                opacity: status === "sending" ? 0.6 : 1,
              }}
            >
              {status === "sending" ? "sending..." : "send magic link"}
            </button>
            {error && (
              <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-danger)" }}>{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
