import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../api/types";

const storage = vi.hoisted(() => new Map<string, unknown>());
const removeStorageSync = vi.hoisted(() => vi.fn((key: string) => { storage.delete(key); }));
vi.mock("@tarojs/taro", () => ({ default: {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync
} }));

import { clearSession, getAccessToken, getSessionSnapshot, getSessionUser, saveSession, saveSessionIfCurrent, subscribeSession } from "./session";

const user: SessionUser = { id: "worker-a", username: "worker", displayName: "工友", role: "JOB_SEEKER", personId: null, branchId: null, supplierId: null, employeeType: null, projectIds: [], permissions: ["job:read", "application:create"] };

beforeEach(() => {
  removeStorageSync.mockImplementation((key: string) => { storage.delete(key); });
  clearSession();
  storage.clear();
});

describe("登录会话同步", () => {
  it("保存与退出立即通知页面，退出不再读取旧身份", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    saveSession("token-a", user);
    expect(getSessionUser()?.id).toBe("worker-a");
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("即使设备存储删除失败，当前应用也不能恢复残留凭证", () => {
    saveSession("token-a", user);
    removeStorageSync.mockImplementation(() => { throw new Error("storage unavailable"); });
    clearSession();
    expect(storage.get("xiangneng.accessToken")).toBe("token-a");
    expect(getAccessToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  it("退出后迟到的资料刷新不能恢复旧账号", () => {
    saveSession("token-a", user);
    const previous = getSessionSnapshot();
    clearSession();
    expect(saveSessionIfCurrent(previous, { ...user, personId: "person-a" })).toBe(false);
    expect(getSessionUser()).toBeNull();
  });

  it("重新登录同一个token也隔离前一次请求，只允许当前资料写入", () => {
    saveSession("token-a", user);
    const previous = getSessionSnapshot();
    clearSession();
    saveSession("token-a", user);
    expect(saveSessionIfCurrent(previous, { ...user, personId: "old-person" })).toBe(false);
    expect(saveSessionIfCurrent(getSessionSnapshot(), { ...user, personId: "person-a" })).toBe(true);
    expect(getSessionUser()?.personId).toBe("person-a");
  });
});
