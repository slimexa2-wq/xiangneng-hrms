import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "./types";

const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>(), request: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@tarojs/taro", () => ({ default: {
  getStorageSync: (key: string) => mocks.storage.get(key),
  setStorageSync: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorageSync: (key: string) => mocks.storage.delete(key),
  request: mocks.request,
  uploadFile: mocks.uploadFile
} }));

import { apiRequest, uploadFile } from "./client";
import { api } from "./services";
import { clearSession, getAccessToken, getSessionUser, saveSession } from "../auth/session";

const user: SessionUser = { id: "worker-a", username: "worker", displayName: "工友", role: "JOB_SEEKER", personId: "person-a", branchId: null, supplierId: null, employeeType: null, projectIds: [], permissions: ["job:read", "application:create"] };
const unauthorized = { statusCode: 401, data: { error: { code: "AUTH_REQUIRED", message: "请重新登录" }, requestId: "test" } };

beforeEach(() => {
  mocks.request.mockReset();
  mocks.uploadFile.mockReset();
  clearSession();
  saveSession("token-a", user);
});

describe("API返回协议", () => {
  it("正常JSON envelope直接读取SessionUser，允许data为null", async () => {
    mocks.request.mockResolvedValueOnce({ statusCode: 200, data: { data: user } });
    expect(await api.me()).toEqual(user);
    mocks.request.mockResolvedValueOnce({ statusCode: 200, data: { data: null } });
    expect(await apiRequest("/optional")).toBeNull();
  });

  it.each(["<html>gateway</html>", {}, { ok: true }])("普通接口拒绝没有data的2xx：%j", async (data) => {
    mocks.request.mockResolvedValueOnce({ statusCode: 200, data });
    await expect(apiRequest("/auth/me")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("本人报名仅接受真实ok:true，并保留服务同意和推荐token", async () => {
    mocks.request.mockResolvedValueOnce({ statusCode: 200, data: { ok: true } });
    await expect(api.applyOwnJob("job/id", { consent: true, referralToken: "signed-token" })).resolves.toBeUndefined();
    expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: expect.stringContaining("/portal/jobs/job%2Fid/apply"),
      data: { consent: true, referralToken: "signed-token" }
    }));
    mocks.request.mockResolvedValueOnce({ statusCode: 200, data: { ok: false } });
    await expect(api.applyOwnJob("job-a", { consent: true })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    mocks.request.mockResolvedValueOnce({ statusCode: 200, data: { data: null } });
    await expect(api.applyOwnJob("job-a", { consent: true })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("附件成功响应也必须包含JSON envelope", async () => {
    mocks.uploadFile.mockResolvedValueOnce({ statusCode: 200, data: JSON.stringify({}) });
    await expect(uploadFile("/files", "/tmp/file", "附件")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("过期请求与账号切换", () => {
  it("当前账号401立即清空身份", async () => {
    mocks.request.mockResolvedValueOnce(unauthorized);
    await expect(apiRequest("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  it("旧token迟到401不会退出新账号", async () => {
    let resolve!: (value: typeof unauthorized) => void;
    mocks.request.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const result = apiRequest("/auth/me").catch((error: unknown) => error);
    saveSession("token-b", { ...user, id: "worker-b" });
    resolve(unauthorized);
    expect(await result).toMatchObject({ status: 401 });
    expect(getAccessToken()).toBe("token-b");
    expect(getSessionUser()?.id).toBe("worker-b");
  });

  it("未登录接口的401不会清除已经登录的身份", async () => {
    mocks.request.mockResolvedValueOnce(unauthorized);
    await expect(apiRequest("/auth/login", { authenticated: false })).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBe("token-a");
  });

  it("旧附件上传401也不会清掉新账号，当前上传401会退出", async () => {
    const failure = { statusCode: 401, data: JSON.stringify(unauthorized.data) };
    let resolve!: (value: typeof failure) => void;
    mocks.uploadFile.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const result = uploadFile("/files", "/tmp/file", "附件").catch((error: unknown) => error);
    saveSession("token-b", { ...user, id: "worker-b" });
    resolve(failure);
    expect(await result).toMatchObject({ status: 401 });
    expect(getAccessToken()).toBe("token-b");
    mocks.uploadFile.mockResolvedValueOnce(failure);
    await expect(uploadFile("/files", "/tmp/file", "附件")).rejects.toMatchObject({ status: 401 });
    expect(getSessionUser()).toBeNull();
  });
});
