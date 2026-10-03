import Taro from "@tarojs/taro";
import type { SessionUser } from "../api/types";

const TOKEN_KEY = "xiangneng.accessToken";
const USER_KEY = "xiangneng.sessionUser";
let currentSession: { token: string | null; user: SessionUser | null } | undefined;
let revision = 0;
export type SessionSnapshot = { token: string | null; revision: number };
const listeners = new Set<() => void>();

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifySession(): void {
  listeners.forEach((listener) => listener());
}

export function getAccessToken(): string | null {
  if (currentSession) return currentSession.token;
  try {
    const value = Taro.getStorageSync<string>(TOKEN_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  if (currentSession) return currentSession.user;
  if (!getAccessToken()) return null;
  try {
    const value = Taro.getStorageSync<SessionUser>(USER_KEY);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function getSessionSnapshot(): SessionSnapshot {
  return { token: getAccessToken(), revision };
}

export function isSessionCurrent(snapshot: SessionSnapshot): boolean {
  return snapshot.revision === revision && snapshot.token === getAccessToken();
}

export function saveSessionIfCurrent(snapshot: SessionSnapshot, user: SessionUser): boolean {
  if (!snapshot.token || !isSessionCurrent(snapshot)) return false;
  saveSession(snapshot.token, user);
  return true;
}

export function clearSessionIfCurrent(snapshot: SessionSnapshot): boolean {
  if (!snapshot.token || !isSessionCurrent(snapshot)) return false;
  clearSession();
  return true;
}

export function saveSession(token: string, user: SessionUser): void {
  try {
    Taro.setStorageSync(TOKEN_KEY, token);
    Taro.setStorageSync(USER_KEY, user);
    currentSession = { token, user };
    revision += 1;
    notifySession();
  } catch (error) {
    clearSession();
    throw error;
  }
}

export function clearSession(): void {
  currentSession = { token: null, user: null };
  revision += 1;
  for (const key of [TOKEN_KEY, USER_KEY]) {
    try { Taro.removeStorageSync(key); } catch { /* 内存会话已失效，不再读取残留凭证。 */ }
  }
  notifySession();
}
