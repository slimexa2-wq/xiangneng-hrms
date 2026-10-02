import { compare } from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataScopeType, Permission, UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import { buildTestApp, createPrismaMock, testConfig, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
const openId = "test-only-wechat-openid";
const sessionKey = "test-only-wechat-session-secret";
const unionId = "test-only-wechat-unionid";
const configured = {
  ...testConfig,
  WECHAT_MINIAPP_APP_ID: "test-only-app-id",
  WECHAT_MINIAPP_APP_SECRET: "test-only-app-secret"
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});

type StoredUser = ReturnType<typeof userFixture> & { wechatMiniappOpenId?: string };

function userStore(initialUsers: StoredUser[] = []) {
  const users = new Map(initialUsers.map((user) => [user.id, user]));
  const findUnique = vi.fn(async (raw: unknown) => {
    const { where } = raw as { where: { id?: string; username?: string; wechatMiniappOpenId?: string } };
    return [...users.values()].find((user) =>
      (where.id !== undefined && where.id === user.id) ||
      (where.username !== undefined && where.username === user.username) ||
      (where.wechatMiniappOpenId !== undefined && where.wechatMiniappOpenId === user.wechatMiniappOpenId)
    ) ?? null;
  });
  const create = vi.fn(async () => { throw new Error("First login must use the unique WeChat identity"); });
  const update = vi.fn(async () => { throw new Error("Login must not mutate an existing account"); });
  const upsert = vi.fn(async (raw: unknown) => {
    const args = raw as {
      where: { wechatMiniappOpenId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    const existing = [...users.values()].find((user) => user.wechatMiniappOpenId === args.where.wechatMiniappOpenId);
    if (existing) {
      Object.assign(existing, args.update);
      return existing;
    }
    const user = userFixture({
      id: `10000000-0000-4000-8000-${String(users.size + 1).padStart(12, "0")}`,
      ...args.create,
      projectLinks: [],
      roleAssignments: [],
      dataScopeBindings: []
    }) as StoredUser;
    users.set(user.id, user);
    return user;
  });
  const auditCreate = vi.fn(async () => ({ id: "test-audit-id" }));
  const prisma = createPrismaMock({ user: { findUnique, create, update, upsert }, auditLog: { create: auditCreate } });
  return { prisma, users, findUnique, create, update, upsert, auditCreate };
}

function stubWechat(payload: unknown = { openid: openId, session_key: sessionKey, unionid: unionId }, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function makeApp(store = userStore(), config = configured) {
  const app = await buildTestApp(store.prisma, config);
  apps.push(app);
  return { app, store };
}

function expectNoUserWrite(store: ReturnType<typeof userStore>) {
  expect(store.create).not.toHaveBeenCalled();
  expect(store.update).not.toHaveBeenCalled();
  expect(store.upsert).not.toHaveBeenCalled();
  expect(store.users.size).toBe(0);
}

function expectNoWechatSecrets(body: string) {
  for (const secret of [openId, sessionKey, unionId, configured.WECHAT_MINIAPP_APP_SECRET]) {
    expect(body).not.toContain(secret);
  }
  for (const field of ["session_key", "passwordHash", "wechatMiniappOpenId", "wechatUnionId"]) {
    expect(body).not.toContain(field);
  }
}

describe("首次微信登录", () => {
  it.each(["/api/wechat/auth/login", "/api/wechat/auth"])("%s 未配置时不请求微信或创建用户", async (url) => {
    const fetchMock = stubWechat();
    const { app, store } = await makeApp(userStore(), testConfig);

    const response = await app.inject({ method: "POST", url, payload: { code: "one-use-code" } });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_NOT_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoUserWrite(store);
  });

  it("真实校验 code 后创建仅有本人范围的求职者，并可继续访问认证接口", async () => {
    const fetchMock = stubWechat();
    const { app, store } = await makeApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/wechat/auth/login",
      payload: {
        code: "one-use-code",
        role: UserRole.SYSTEM_ADMIN,
        branchId: "forged-branch",
        personId: "forged-person",
        projectLinks: [{ projectId: "forged-project" }]
      }
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.user).toMatchObject({
      role: UserRole.JOB_SEEKER,
      roles: [UserRole.JOB_SEEKER],
      branchId: null,
      supplierId: null,
      personId: null,
      projectIds: [],
      permissions: [Permission.JOB_READ, Permission.APPLICATION_CREATE],
      scopeBindings: [{ type: DataScopeType.SELF, branchId: null, supplierId: null, projectId: null, organizationUnitId: null }]
    });
    expect(data.user.username).toMatch(/^wx_[a-f0-9]{40}$/);
    expect(store.users.size).toBe(1);
    const user = [...store.users.values()][0]!;
    expect(user).toMatchObject({ role: UserRole.JOB_SEEKER, isActive: true, personId: null, branchId: null, supplierId: null });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    for (const guess of ["one-use-code", openId]) {
      expect(await compare(guess, user.passwordHash)).toBe(false);
    }
    expect(user).not.toHaveProperty("session_key");
    expect(user).not.toHaveProperty("sessionKey");
    expect(JSON.stringify(user)).not.toContain(sessionKey);
    const [requestUrl, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const upstream = new URL(requestUrl);
    expect(`${upstream.origin}${upstream.pathname}`).toBe("https://api.weixin.qq.com/sns/jscode2session");
    expect(upstream.searchParams.get("appid")).toBe(configured.WECHAT_MINIAPP_APP_ID);
    expect(upstream.searchParams.get("secret")).toBe(configured.WECHAT_MINIAPP_APP_SECRET);
    expect(upstream.searchParams.get("js_code")).toBe("one-use-code");
    expect(upstream.searchParams.get("grant_type")).toBe("authorization_code");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expectNoWechatSecrets(response.body);
    expectNoWechatSecrets(JSON.stringify(app.jwt.decode(data.token)));
    expect(store.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: "AUTH_WECHAT_LOGIN_SUCCEEDED", actorId: user.id, resourceId: user.id
    }) }));
    expectNoWechatSecrets(JSON.stringify(store.auditCreate.mock.calls));

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${data.token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ data: { id: user.id, role: UserRole.JOB_SEEKER, personId: null } });
  });

  it("同一微信身份再次登录复用原账号", async () => {
    stubWechat();
    const { app, store } = await makeApp();
    const first = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "first-code" } });
    const second = await app.inject({ method: "POST", url: "/api/wechat/auth", payload: { code: "second-code" } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.user.id).toBe(first.json().data.user.id);
    expect(second.json().data.user.username).toBe(first.json().data.user.username);
    expect(store.users.size).toBe(1);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it("并发首次登录仍只有一个账号", async () => {
    stubWechat();
    const { app, store } = await makeApp();
    const responses = await Promise.all(Array.from({ length: 3 }, (_, index) =>
      app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: `concurrent-code-${index}` } })
    ));

    for (const response of responses) expect(response.statusCode).toBe(200);
    expect(new Set(responses.map((response) => response.json().data.user.id)).size).toBe(1);
    expect(store.users.size).toBe(1);
    expect([...store.users.values()][0]?.role).toBe(UserRole.JOB_SEEKER);
  });

  it("停用的既有账号被拒绝，不能被首次登录流程复活或替换", async () => {
    stubWechat();
    const disabled = userFixture({ wechatMiniappOpenId: openId, isActive: false, role: UserRole.EMPLOYEE }) as StoredUser;
    const { app, store } = await makeApp(userStore([disabled]));

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "valid-code" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "ACCOUNT_DISABLED" } });
    expect(response.json()).not.toHaveProperty("data.token");
    expect(store.users.size).toBe(1);
    expect(store.users.get(disabled.id)).toMatchObject({ isActive: false, role: UserRole.EMPLOYEE });
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it("已有员工账号沿用有效角色与项目范围，不因首次登录逻辑被改成求职者", async () => {
    stubWechat();
    const existing = userFixture({
      wechatMiniappOpenId: openId,
      username: "existing-employee",
      role: UserRole.EMPLOYEE,
      personId: "20000000-0000-4000-8000-000000000001",
      projectLinks: [{ projectId: "30000000-0000-4000-8000-000000000001" }],
      roleAssignments: [{
        status: "ACTIVE",
        validFrom: new Date("2020-01-01T00:00:00Z"),
        validTo: null,
        role: { code: UserRole.INTERNAL_HR },
        scopes: [{
          type: DataScopeType.BRANCH,
          branchId: "40000000-0000-4000-8000-000000000001",
          organizationUnitId: null,
          projectId: null,
          supplierId: null,
          isActive: true,
          validFrom: new Date("2020-01-01T00:00:00Z"),
          validTo: null
        }]
      }],
      dataScopeBindings: []
    }) as StoredUser;
    const { app, store } = await makeApp(userStore([existing]));

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "valid-code" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { user: {
      id: existing.id,
      username: "existing-employee",
      role: UserRole.INTERNAL_HR,
      roles: [UserRole.INTERNAL_HR],
      personId: existing.personId,
      projectIds: ["30000000-0000-4000-8000-000000000001"],
      permissions: expect.arrayContaining([Permission.INTERNAL_EMPLOYEE_WRITE]),
      scopeBindings: [expect.objectContaining({ type: DataScopeType.BRANCH, branchId: "40000000-0000-4000-8000-000000000001" })]
    } } });
    expect(store.users.size).toBe(1);
    expect(store.users.get(existing.id)?.role).toBe(UserRole.EMPLOYEE);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expectNoWechatSecrets(response.body);
  });

  it("首次查询与写入之间发现已停用的同身份账号时也拒绝登录", async () => {
    stubWechat();
    const disabled = userFixture({ wechatMiniappOpenId: openId, isActive: false, role: UserRole.EMPLOYEE }) as StoredUser;
    const store = userStore([disabled]);
    store.findUnique.mockResolvedValueOnce(null);
    const { app } = await makeApp(store);

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "valid-code" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "ACCOUNT_DISABLED" } });
    expect(store.users.size).toBe(1);
    expect(store.users.get(disabled.id)).toMatchObject({ isActive: false, role: UserRole.EMPLOYEE });
    expect(store.auditCreate).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "a".repeat(257), 123])("拒绝无效 code %j，既不访问微信也不写用户", async (code) => {
    const fetchMock = stubWechat();
    const { app, store } = await makeApp();

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoUserWrite(store);
  });

  it.each([
    new Error(`upstream URL exposes ${configured.WECHAT_MINIAPP_APP_SECRET}`),
    new DOMException("Timed out", "TimeoutError")
  ])("网络失败或超时统一返回固定 502，不暴露上游细节", async (error) => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
    const { app, store } = await makeApp();

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "valid-code" } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_UPSTREAM_UNAVAILABLE" } });
    expectNoWechatSecrets(response.body);
    expect(response.body).not.toContain(error.message);
    expectNoUserWrite(store);
  });

  it.each([
    { payload: { errcode: 40029, errmsg: `invalid code ${sessionKey}`, session_key: sessionKey }, status: 200 },
    { payload: { session_key: sessionKey, unionid: unionId }, status: 200 },
    { payload: null, status: 200 },
    { payload: { openid: 123, session_key: sessionKey }, status: 200 },
    { payload: { openid: openId, session_key: sessionKey }, status: 503 }
  ])("无有效身份的微信响应统一拒绝 $payload", async ({ payload, status }) => {
    stubWechat(payload, status);
    const { app, store } = await makeApp();

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "valid-code" } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_AUTH_FAILED" } });
    expect(response.json().error).not.toHaveProperty("details");
    expectNoWechatSecrets(response.body);
    expectNoUserWrite(store);
  });

  it("微信返回非法 JSON 时固定拒绝，不落为未处理的 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>upstream error</html>", { status: 200 })));
    const { app, store } = await makeApp();

    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "valid-code" } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_AUTH_FAILED" } });
    expectNoUserWrite(store);
  });

  it.each(["/api/wechat/auth/login", "/api/wechat/auth"])("%s 限制每分钟最多十次登录尝试", async (url) => {
    const fetchMock = stubWechat({ errcode: 40029 });
    const { app, store } = await makeApp();
    for (let index = 0; index < 10; index++) {
      const response = await app.inject({ method: "POST", url, payload: { code: `code-${index}` } });
      expect(response.statusCode).toBe(502);
    }

    const limited = await app.inject({ method: "POST", url, payload: { code: "eleventh-code" } });

    expect(limited.statusCode).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expectNoUserWrite(store);
  });
});
