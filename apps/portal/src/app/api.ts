import { handlePortalDemoRequest } from './demo';
import type { Session } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

// 本地演示统一走 Vite 的同源 /api 代理，避免端口/主机名变化导致跨域或旧缓存干扰。
const coreBase = (import.meta.env.VITE_CORE_API_URL as string | undefined) ?? '/api';
const tokenKey = 'xiangneng_core_token';
// 演示只能由构建配置显式开启；生产 API 故障不能转为本地“报名成功”。
export const demoFallbackEnabled = (import.meta.env.VITE_PORTAL_DEMO_FALLBACK as string | undefined) === 'true';

function portalPath(path: string): string {
  return `/portal${path.replace(/^\/api/, '')}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (path === '/api/session' && init.method === 'DELETE') {
    sessionStorage.removeItem(tokenKey);
    if (demoFallbackEnabled) return handlePortalDemoRequest<T>(path, init);
    return { ok: true } as T;
  }

  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = sessionStorage.getItem(tokenKey);
  const publicPath = path === '/api/personas' || path.startsWith('/api/qrcodes/');
  if (token && !publicPath) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${coreBase}${portalPath(path)}`, { ...init, headers });
  } catch (error) {
    if (demoFallbackEnabled) return handlePortalDemoRequest<T>(path, init);
    throw error;
  }
  const value = await response.json().catch(() => null) as Record<string, any> | null;
  if (demoFallbackEnabled && (!value || response.status === 404 || response.status >= 500)) {
    return handlePortalDemoRequest<T>(path, init);
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(value?.error?.code ?? value?.code ?? 'REQUEST_FAILED'),
      String(value?.error?.message ?? value?.message ?? '请求失败，请稍后重试'),
      value?.error?.details ?? value?.details
    );
  }

  if (path === '/api/session/select-persona') {
    const tokenValue = value?.token ?? value?.data?.token;
    const session = value?.session ?? value?.data?.session;
    if ((!tokenValue || !session) && demoFallbackEnabled) return handlePortalDemoRequest<T>(path, init);
    if (!tokenValue || !session) throw new ApiError(502, 'INVALID_SESSION_RESPONSE', '演示身份初始化失败');
    sessionStorage.setItem(tokenKey, String(tokenValue));
    return session as T;
  }

  const payload = value?.data ?? value;
  if (init.method === 'POST' && /^\/api\/jobs\/[^/]+\/apply(?:\?.*)?$/.test(path) && payload?.ok !== true) {
    throw new ApiError(502, 'INVALID_APPLICATION_RESPONSE', '报名服务返回了无效结果，请刷新后重试');
  }
  return payload as T;
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) };
}

export async function loginToPortal(username: string, password: string): Promise<Session> {
  const response = await fetch(`${coreBase}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value?.data?.token) {
    throw new ApiError(response.status, 'LOGIN_FAILED', value?.error?.message ?? '登录失败，请检查账号或网络。');
  }
  sessionStorage.setItem(tokenKey, String(value.data.token));
  return api<Session>('/api/session');
}
