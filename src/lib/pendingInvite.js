export const PENDING_INVITE_KEY = "studioAshPendingInvite";

export function readJoinTokenFromUrl() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("join")?.trim() || null;
  } catch {
    return null;
  }
}

export function stashPendingInviteFromUrl() {
  const t = readJoinTokenFromUrl();
  if (t) {
    try {
      localStorage.setItem(PENDING_INVITE_KEY, t);
    } catch {
      /* ignore */
    }
  }
}

export function readPendingInviteToken() {
  const fromUrl = readJoinTokenFromUrl();
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(PENDING_INVITE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore */
  }
}

export function stripJoinFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("join")) return;
    u.searchParams.delete("join");
    window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  } catch {
    /* ignore */
  }
}
