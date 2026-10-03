import { afterEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import { buildTestApp, createPrismaMock, testConfig, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
const openId = "test-bind-openid";
const unionId = "test-bind-unionid";
const sessionKey = "test-bind-session-key";
const configured = {
  ...testConfig,
  WECHAT_MINIAPP_APP_ID: "test-bind-app-id",
  WECHAT_MINIAPP_APP_SECRET: "test-bind-app-secret"
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});

type BindUser = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  tokenVersion: number;
  personId: string | null;
  branchId: string | null;
  supplierId: string | null;
  employeeType: string | null;
  wechatMiniappOpenId: string | null;
  wechatUnionId: string | null;
  projectLinks: Array<{ projectId: string }>;
  roleAssignments: unknown[];
  dataScopeBindings: unknown[];
  internalEmployee: { id: string } | null;
};

function bindUser(input: Partial<BindUser> = {}): BindUser {
  return {
    ...userFixture(),
    wechatMiniappOpenId: null,
    wechatUnionId: null,
    roleAssignments: [],
    dataScopeBindings: [],
    internalEmployee: null,
    ...input
  };
}

function existingHrmsUser(): BindUser {
  return bindUser({
    id: "10000000-0000-4000-8000-000000000001",
    username: "existing-hrms-hr",
    role: UserRole.INTERNAL_HR,
    branchId: "20000000-0000-4000-8000-000000000001",
    personId: "30000000-0000-4000-8000-000000000001",
    tokenVersion: 4
  });
}

function temporaryWechatUser(input: Partial<BindUser> = {}): BindUser {
  return bindUser({
    id: "10000000-0000-4000-8000-000000000002",
    username: `wx_${"a".repeat(40)}`,
    role: UserRole.JOB_SEEKER,
    wechatMiniappOpenId: openId,
    wechatUnionId: unionId,
    tokenVersion: 7,
    ...input
  });
}

function bindingStore(target = existingHrmsUser(), owner: BindUser | null = temporaryWechatUser(), releaseCount = 1) {
  const users = new Map([target, ...(owner ? [owner] : [])].map((user) => [user.id, user]));
  const findUnique = vi.fn(async (raw: unknown) => {
    const { where } = raw as { where: { id?: string; wechatMiniappOpenId?: string } };
    return [...users.values()].find((user) =>
      (where.id !== undefined && user.id === where.id) ||
      (where.wechatMiniappOpenId !== undefined && user.wechatMiniappOpenId === where.wechatMiniappOpenId)
    ) ?? null;
  });
  const updateMany = vi.fn(async (raw: unknown) => {
    if (releaseCount !== 1) return { count: releaseCount };
    const args = raw as { where: { id: string }; data: Omit<Partial<BindUser>, "tokenVersion"> & { tokenVersion: { increment: number } } };
    const user = users.get(args.where.id)!;
    const nextTokenVersion = user.tokenVersion + args.data.tokenVersion.increment;
    Object.assign(user, args.data, { tokenVersion: nextTokenVersion });
    return { count: 1 };
  });
  const update = vi.fn(async (raw: unknown) => {
    const args = raw as { where: { id: string }; data: Partial<BindUser> };
    const user = users.get(args.where.id)!;
    Object.assign(user, args.data);
    return user;
  });
  const create = vi.fn(async () => { throw new Error("Binding must preserve existing users"); });
  const deleteUser = vi.fn(async () => { throw new Error("Binding must preserve account history"); });
  const auditCreate = vi.fn(async () => ({ id: "binding-audit-id" }));
  const prisma = createPrismaMock({
    user: { findUnique, updateMany, update, create, delete: deleteUser },
    auditLog: { create: auditCreate }
  });
  return { prisma, users, target, owner, findUnique, updateMany, update, create, deleteUser, auditCreate };
}

function stubWechat(beforeResponse?: () => void) {
  const fetchMock = vi.fn(async () => {
    beforeResponse?.();
    return Response.json({ openid: openId, unionid: unionId, session_key: sessionKey });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function makeApp(store = bindingStore()) {
  const app = await buildTestApp(store.prisma, configured);
  apps.push(app);
  const token = app.jwt.sign({ sub: store.target.id, tokenVersion: store.target.tokenVersion });
  return { app, store, authorization: `Bearer ${token}` };
}

function expectNoOwnershipWrite(store: ReturnType<typeof bindingStore>) {
  expect(store.updateMany).not.toHaveBeenCalled();
  expect(store.update).not.toHaveBeenCalled();
  expect(store.create).not.toHaveBeenCalled();
  expect(store.deleteUser).not.toHaveBeenCalled();
  expect(store.auditCreate).not.toHaveBeenCalled();
}

function expectNoSecrets(text: string) {
  for (const secret of [openId, unionId, sessionKey, configured.WECHAT_MINIAPP_APP_SECRET]) {
    expect(text).not.toContain(secret);
  }
}

describe("微信绑定的账号归属边界", () => {
  it("只将未关联业务的临时微信账号转移到当前已认证 HRMS 账号，保留历史且撤销旧 JWT", async () => {
    stubWechat();
    const { app, store, authorization } = await makeApp();
    const owner = store.owner!;
    const ownerToken = app.jwt.sign({ sub: owner.id, tokenVersion: owner.tokenVersion });
    const targetBefore = structuredClone(store.target);
    const ownerId = owner.id;

    const response = await app.inject({
      method: "POST",
      url: "/api/wechat/bind",
      headers: { authorization },
      payload: { code: "valid-bind-code", userId: ownerId, role: UserRole.SYSTEM_ADMIN }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { bound: true } });
    expect(store.target).toMatchObject({
      id: targetBefore.id,
      role: targetBefore.role,
      personId: targetBefore.personId,
      branchId: targetBefore.branchId,
      tokenVersion: targetBefore.tokenVersion,
      wechatMiniappOpenId: openId,
      wechatUnionId: unionId
    });
    expect(store.users.get(ownerId)).toMatchObject({
      id: ownerId,
      role: UserRole.JOB_SEEKER,
      isActive: false,
      tokenVersion: 8,
      wechatMiniappOpenId: null,
      wechatUnionId: null
    });
    expect(store.users.size).toBe(2);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.deleteUser).not.toHaveBeenCalled();
    const audits = store.auditCreate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    expect(audits.map(([args]) => args.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "WECHAT_TEMPORARY_ACCOUNT_RELEASED", actorId: targetBefore.id, resourceId: ownerId }),
      expect.objectContaining({ action: "WECHAT_MINIAPP_BIND", actorId: targetBefore.id, resourceId: targetBefore.id,
        after: expect.objectContaining({ transferredTemporaryAccount: true }) })
    ]));
    expectNoSecrets(response.body);
    expectNoSecrets(JSON.stringify(audits));

    const staleOwner = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${ownerToken}` } });
    expect(staleOwner.statusCode).toBe(401);
    const current = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization } });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ data: { id: targetBefore.id, role: UserRole.INTERNAL_HR, personId: targetBefore.personId } });
  });

  it.each([
    { reason: "已有本人档案", owner: { personId: "linked-person" } },
    { reason: "已有分公司", owner: { branchId: "linked-branch" } },
    { reason: "已有供应商", owner: { supplierId: "linked-supplier" } },
    { reason: "已有项目", owner: { projectLinks: [{ projectId: "linked-project" }] } },
    { reason: "已有角色分配", owner: { roleAssignments: [{ status: "EXPIRED" }] } },
    { reason: "已有数据范围", owner: { dataScopeBindings: [{ isActive: false }] } },
    { reason: "已有内部员工关系", owner: { internalEmployee: { id: "linked-internal-employee" } } },
    { reason: "已停用", owner: { isActive: false } },
    { reason: "已经是员工", owner: { role: UserRole.EMPLOYEE } },
    { reason: "已经是管理员", owner: { role: UserRole.SYSTEM_ADMIN } },
    { reason: "普通求职者账号", owner: { username: "registered-job-seeker" } },
    { reason: "伪装为临时用户名", owner: { username: `wx_${"a".repeat(39)}` } }
  ])("$reason 的占用账号不能被绑定请求挪走", async ({ owner: overrides }) => {
    stubWechat();
    const store = bindingStore(existingHrmsUser(), temporaryWechatUser(overrides));
    const targetBefore = structuredClone(store.target);
    const ownerBefore = structuredClone(store.owner);
    const { app, authorization } = await makeApp(store);

    const response = await app.inject({ method: "POST", url: "/api/wechat/bind", headers: { authorization }, payload: { code: "valid-bind-code" } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_ALREADY_BOUND" } });
    expect(store.target).toEqual(targetBefore);
    expect(store.owner).toEqual(ownerBefore);
    expectNoOwnershipWrite(store);
    expectNoSecrets(response.body);
  });

  it("临时账号释放 CAS 未命中时明确冲突，绝不更新目标账号", async () => {
    stubWechat();
    const store = bindingStore(existingHrmsUser(), temporaryWechatUser(), 0);
    const before = structuredClone([...store.users.values()]);
    const { app, authorization } = await makeApp(store);

    const response = await app.inject({ method: "POST", url: "/api/wechat/bind", headers: { authorization }, payload: { code: "valid-bind-code" } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_BINDING_CONFLICT" } });
    expect(store.updateMany).toHaveBeenCalledTimes(1);
    expect(store.update).not.toHaveBeenCalled();
    expect(store.auditCreate).not.toHaveBeenCalled();
    expect([...store.users.values()]).toEqual(before);
  });

  it.each(["TOKEN_VERSION_CHANGED", "ACCOUNT_DISABLED"])("换取微信身份期间 %s 时重新拒绝旧登录态", async (reason) => {
    const store = bindingStore();
    const { app, authorization } = await makeApp(store);
    stubWechat(() => {
      if (reason === "TOKEN_VERSION_CHANGED") store.target.tokenVersion += 1;
      else store.target.isActive = false;
    });

    const response = await app.inject({ method: "POST", url: "/api/wechat/bind", headers: { authorization }, payload: { code: "valid-bind-code" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(store.target.wechatMiniappOpenId).toBeNull();
    expect(store.owner?.wechatMiniappOpenId).toBe(openId);
    expect(store.owner?.isActive).toBe(true);
    expectNoOwnershipWrite(store);
  });

  it("未占用的微信身份可以直接绑定当前账号", async () => {
    stubWechat();
    const { app, store, authorization } = await makeApp(bindingStore(existingHrmsUser(), null));

    const response = await app.inject({ method: "POST", url: "/api/wechat/bind", headers: { authorization }, payload: { code: "valid-bind-code" } });

    expect(response.statusCode).toBe(200);
    expect(store.target).toMatchObject({ role: UserRole.INTERNAL_HR, wechatMiniappOpenId: openId, wechatUnionId: unionId });
    expect(store.updateMany).not.toHaveBeenCalled();
    expect(store.users.size).toBe(1);
  });

  it("重复绑定本人微信身份不释放或停用自己的账号", async () => {
    stubWechat();
    const target = existingHrmsUser();
    target.wechatMiniappOpenId = openId;
    target.wechatUnionId = unionId;
    const { app, store, authorization } = await makeApp(bindingStore(target, null));

    const response = await app.inject({ method: "POST", url: "/api/wechat/bind", headers: { authorization }, payload: { code: "valid-bind-code" } });

    expect(response.statusCode).toBe(200);
    expect(store.target).toMatchObject({ role: UserRole.INTERNAL_HR, isActive: true, tokenVersion: 4, wechatMiniappOpenId: openId });
    expect(store.updateMany).not.toHaveBeenCalled();
    expect(store.users.size).toBe(1);
  });

  it("没有 HRMS 登录态时不能通过微信 code 发起账号转移", async () => {
    const fetchMock = stubWechat();
    const { app, store } = await makeApp();

    const response = await app.inject({ method: "POST", url: "/api/wechat/bind", payload: { code: "valid-bind-code" } });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoOwnershipWrite(store);
  });
});
