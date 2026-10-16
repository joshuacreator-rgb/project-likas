import { useEffect } from "react";

/**
 * Cross-tab session signalling (spec 1.8 / 6.7). A login or logout in one tab
 * invalidates the session every other tab is holding — the server already
 * enforces that by overwriting the active session token — so every tab that
 * could be showing a stale dashboard listens here and kicks itself back to
 * /login immediately instead of waiting for its next auth.me refetch.
 *
 * BroadcastChannel carries the message; a localStorage set+remove pair is the
 * fallback for browsers without it (storage events fire in every other tab,
 * never in the one that wrote).
 */

const CHANNEL = "project-likas-auth";
const STORAGE_KEY = "project-likas-auth";
const TAB_ID_KEY = "project-likas-tab-id";

export type AuthBroadcastType = "likas-login" | "likas-logout";
type AuthBroadcastPayload = { type?: string; tabId?: string; at?: number };

/** One id per tab, stable for the tab's lifetime (sessionStorage is per-tab). */
export function getAuthTabId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(TAB_ID_KEY, next);
    return next;
  } catch {
    // Storage restrictions — a constant id still works within this tab's scope.
    return "likas-tab";
  }
}

export function broadcastAuthEvent(type: AuthBroadcastType) {
  const payload: AuthBroadcastPayload = { type, tabId: getAuthTabId(), at: Date.now() };
  if (typeof BroadcastChannel !== "undefined") {
    try {
      new BroadcastChannel(CHANNEL).postMessage(payload);
    } catch {
      // Fall through to the storage fallback.
    }
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}

/**
 * Run `handler` whenever ANOTHER tab announces a login or logout. Returns the
 * unsubscribe function (the hook wraps this in an effect).
 */
export function subscribeAuthBroadcast(handler: () => void): () => void {
  const tabId = getAuthTabId();
  const handleEvent = (payload: AuthBroadcastPayload | null) => {
    if (!payload || payload.tabId === tabId) return;
    if (payload.type === "likas-login" || payload.type === "likas-logout") handler();
  };

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => handleEvent(event.data);
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handleEvent(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed cross-tab events.
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Mounted on every guarded dashboard route: another tab signing in (or out)
 * means this tab's session is dead server-side, so it hard-redirects to
 * /login — a full navigation that also clears all in-memory query state.
 */
export function useAuthBroadcastKick() {
  useEffect(() => subscribeAuthBroadcast(() => window.location.replace("/login")), []);
}
