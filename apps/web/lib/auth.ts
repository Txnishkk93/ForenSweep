import type { AuthUser } from "./types";

const TOKEN_KEY = "forensweep_token";
const USER_KEY = "forensweep_user";

// NOTE: localStorage is used here for a demo-standalone build. In production,
// prefer the backend setting an httpOnly cookie on login and dropping this
// client-side store entirely. Flagged as a security tradeoff — see the
// implementation report.

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
