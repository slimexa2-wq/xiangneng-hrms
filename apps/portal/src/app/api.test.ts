// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); sessionStorage.clear(); localStorage.clear(); });

describe('正式报名的失败处理', () => {
  it('未开启演示时，服务端失败不会转成浏览器内的报名成功', async () => {
    vi.stubEnv('VITE_PORTAL_DEMO_FALLBACK', 'false');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'DB_UNAVAILABLE', message: '数据库暂时不可用' } }), { status: 503 })));
    const { api } = await import('./api');
    await expect(api('/api/jobs/job-id/apply', { method: 'POST', body: JSON.stringify({ consent: true }) })).rejects.toThrow('数据库暂时不可用');
    expect(localStorage.getItem('xiangneng.portal.demo-state.v3')).toBeNull();
  });
  it('正式网络失败保留错误，不自动创建演示身份', async () => {
    vi.stubEnv('VITE_PORTAL_DEMO_FALLBACK', 'false');
    const fetch = vi.fn().mockRejectedValue(new TypeError('网络连接中断'));
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('./api');
    await expect(api('/api/session')).rejects.toThrow('网络连接中断');
    expect(sessionStorage.getItem('xiangneng_core_token')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
