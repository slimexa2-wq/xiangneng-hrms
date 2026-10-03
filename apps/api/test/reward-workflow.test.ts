import { afterEach, describe, expect, it, vi } from "vitest";
import { EmploymentStatus, RewardStatus, UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createPrismaMock,
  login,
  passwordHash,
  userFixture
} from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const rewardId = "40000000-0000-4000-8000-000000000001";
const personId = "41000000-0000-4000-8000-000000000001";
const jobDemandId = "42000000-0000-4000-8000-000000000001";
const branchId = "43000000-0000-4000-8000-000000000001";
const recommenderUserId = "44000000-0000-4000-8000-000000000001";
const payment = {
  reference: "CD202610020001",
  proof: "https://example.test/receipts/CD202610020001.pdf",
  paidAt: new Date().toISOString()
};

type HarnessOptions = {
  role?: (typeof UserRole)[keyof typeof UserRole];
  status?: (typeof RewardStatus)[keyof typeof RewardStatus];
  onboardDate?: Date | null;
  employmentStatus?: (typeof EmploymentStatus)[keyof typeof EmploymentStatus];
  offboardDate?: Date | null;
  policySnapshot?: Record<string, unknown> | null;
  accessible?: boolean;
  updateCount?: number;
};

async function rewardHarness(options: HarnessOptions = {}) {
  const user = userFixture({
    username: "reward-user",
    role: options.role ?? UserRole.SYSTEM_ADMIN,
    branchId,
    passwordHash: await passwordHash()
  });
  let stored = {
    id: rewardId,
    referralId: "45000000-0000-4000-8000-000000000001",
    policyId: "46000000-0000-4000-8000-000000000001",
    amount: "800.00",
    status: options.status ?? RewardStatus.PENDING,
    notes: null as string | null,
    achievedAt: null as Date | null,
    approvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    approvedById: "49000000-0000-4000-8000-000000000001",
    paidAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    referral: {
      id: "45000000-0000-4000-8000-000000000001",
      personId,
      recommenderUserId,
      jobDemandId,
      policySnapshot: options.policySnapshot === undefined
        ? { retentionDays: 30, rewardAmount: 800 }
        : options.policySnapshot,
      application: {
        id: "47000000-0000-4000-8000-000000000001",
        personId,
        jobDemandId,
        employmentStatus: options.employmentStatus ?? EmploymentStatus.ACTIVE,
        onboardDate: options.onboardDate === undefined
          ? new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
          : options.onboardDate,
        offboardDate: options.offboardDate ?? null
      }
    }
  };
  const findFirst = vi.fn(async (_raw: unknown) => options.accessible === false ? null : stored);
  const findMany = vi.fn(async (_raw: unknown) => []);
  const count = vi.fn(async (_raw: unknown) => 0);
  const updateMany = vi.fn(async (raw: unknown) => {
    if (options.updateCount === 0) return { count: 0 };
    stored = { ...stored, ...(raw as { data: Partial<typeof stored> }).data };
    return { count: 1 };
  });
  const paymentCreate = vi.fn(async (raw: unknown) => ({
    id: "48000000-0000-4000-8000-000000000001",
    ...(raw as { data: Record<string, unknown> }).data
  }));
  const auditCreate = vi.fn(async () => ({ id: "audit" }));
  const prisma = createPrismaMock({
    user: { findUnique: async () => user },
    referralReward: {
      findFirst,
      findMany,
      count,
      findUnique: async () => stored,
      updateMany
    },
    referralRewardPayment: { create: paymentCreate },
    auditLog: { create: auditCreate }
  });
  const app = await buildTestApp(prisma);
  apps.push(app);
  const token = await login(app, "reward-user");
  auditCreate.mockClear();
  const patch = (payload: Record<string, unknown>) => app.inject({
    method: "PATCH",
    url: `/api/referral-rewards/${rewardId}`,
    headers: { authorization: `Bearer ${token}` },
    payload
  });
  return { app, token, user, patch, findFirst, findMany, count, updateMany, paymentCreate, auditCreate };
}

describe("推荐奖励状态与资金权限", () => {
  it.each([UserRole.FINANCE_REVIEWER, UserRole.CASHIER])("%s 的查看权限不能代替运营核实达成", async (role) => {
    const { patch, updateMany } = await rewardHarness({ role });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "试图使用查看权限确认达成" });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("出纳查看权限不能取消待处理奖励", async () => {
    const { patch, updateMany } = await rewardHarness({ role: UserRole.CASHIER });
    const response = await patch({ status: RewardStatus.CANCELLED, notes: "试图以出纳身份取消奖励" });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([UserRole.RESOURCE_SPECIALIST, UserRole.FINANCE_REVIEWER, UserRole.CASHIER])(
    "%s 查看奖励列表与数量时只能查询登录态范围",
    async (role) => {
      const { app, token, findMany, count } = await rewardHarness({ role });
      const response = await app.inject({
        method: "GET",
        url: "/api/referral-rewards",
        headers: { authorization: `Bearer ${token}` }
      });
      expect(response.statusCode).toBe(200);
      const listWhere = (findMany.mock.calls[0]?.[0] as { where: unknown } | undefined)?.where;
      const countWhere = (count.mock.calls[0]?.[0] as { where: unknown } | undefined)?.where;
      expect(JSON.stringify(listWhere)).toContain(branchId);
      expect(countWhere).toEqual(listWhere);
    }
  );

  it("未登录不能更改推荐奖励", async () => {
    const { app, updateMany } = await rewardHarness();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/referral-rewards/${rewardId}`,
      payload: { status: RewardStatus.ACHIEVED, notes: "已核验在职满三十天" }
    });
    expect(response.statusCode).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("推荐人不能自行确认或审核推荐奖励", async () => {
    const { patch, findFirst, updateMany } = await rewardHarness({ role: UserRole.EMPLOYEE });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "自行确认奖励" });
    expect(response.statusCode).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("禁止跳过达标和财务审核直接将待达标奖励改为已付款", async () => {
    const { patch, updateMany, paymentCreate } = await rewardHarness();
    const response = await patch({ status: RewardStatus.PAID, payment });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("留存期未满不能人工确认达标", async () => {
    const { patch, updateMany } = await rewardHarness({
      onboardDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "核验在职日期" });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("留存未满期已离职报名不能确认奖励达标", async () => {
    const { patch, updateMany } = await rewardHarness({
      employmentStatus: EmploymentStatus.LEFT,
      onboardDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      offboardDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "核验推荐人员留存" });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("曾经留存满期的报名离职后仍保留达标权益", async () => {
    const { patch, updateMany } = await rewardHarness({
      employmentStatus: EmploymentStatus.LEFT,
      offboardDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "本次报名已实际留存满三十天后离职" });
    expect(response.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("缺少留存规则快照的旧记录不能自动按当前政策认定达标", async () => {
    const { patch, updateMany } = await rewardHarness({ policySnapshot: null });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "核验推荐人员留存" });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("财务审批时再次验证本次报名留存条件", async () => {
    const { patch, updateMany } = await rewardHarness({
      role: UserRole.FINANCE_REVIEWER,
      status: RewardStatus.ACHIEVED,
      onboardDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    });
    const response = await patch({ status: RewardStatus.APPROVED, notes: "审核推荐奖励政策和入职依据" });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("缺少本次报名入职日期时不能确认达标", async () => {
    const { patch, updateMany } = await rewardHarness({ onboardDate: null });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "核验推荐人员留存" });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("资源专员可确认本次报名已经留存满期并记录审计", async () => {
    const { patch, user, updateMany, auditCreate } = await rewardHarness({ role: UserRole.RESOURCE_SPECIALIST });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "已核验本次报名在职满三十天" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: rewardId, status: RewardStatus.ACHIEVED } });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorId: user.id, resourceId: rewardId, resourceType: "ReferralReward" })
    }));
  });

  it.each([
    { current: RewardStatus.PENDING, target: RewardStatus.ACHIEVED },
    { current: RewardStatus.ACHIEVED, target: RewardStatus.APPROVED },
    { current: RewardStatus.PENDING, target: RewardStatus.CANCELLED }
  ])("$target 必须填写有内容的处理说明", async ({ current, target }) => {
    const { patch, updateMany } = await rewardHarness({ status: current });
    const response = await patch({ status: target, notes: "   " });
    expect(response.statusCode).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("资源专员不能代替财务审核推荐奖励", async () => {
    const { patch, updateMany } = await rewardHarness({
      role: UserRole.RESOURCE_SPECIALIST,
      status: RewardStatus.ACHIEVED
    });
    const response = await patch({ status: RewardStatus.APPROVED, notes: "核验推荐金额与政策" });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("财务可以审核达标奖励", async () => {
    const { patch, updateMany } = await rewardHarness({
      role: UserRole.FINANCE_REVIEWER,
      status: RewardStatus.ACHIEVED
    });
    const response = await patch({ status: RewardStatus.APPROVED, notes: "奖励金额与政策快照一致，审核通过" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { status: RewardStatus.APPROVED } });
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("财务审核账号不能执行出纳付款", async () => {
    const { patch, updateMany, paymentCreate } = await rewardHarness({
      role: UserRole.FINANCE_REVIEWER,
      status: RewardStatus.APPROVED
    });
    const response = await patch({ status: RewardStatus.PAID, payment });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("出纳不能代替财务审核", async () => {
    const { patch, updateMany } = await rewardHarness({
      role: UserRole.CASHIER,
      status: RewardStatus.ACHIEVED
    });
    const response = await patch({ status: RewardStatus.APPROVED, notes: "审核推荐奖励" });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("出纳付款必须提交付款凭证", async () => {
    const { patch, updateMany, paymentCreate } = await rewardHarness({
      role: UserRole.CASHIER,
      status: RewardStatus.APPROVED
    });
    const response = await patch({
      status: RewardStatus.PAID,
      payment: { reference: payment.reference, paidAt: payment.paidAt }
    });
    expect(response.statusCode).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it.each([
    { label: "缺失", paidAt: null },
    { label: "未来", paidAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    { label: "早于财务审批", paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() }
  ])("付款日期$label时不能登记发放", async ({ paidAt }) => {
    const { patch, updateMany, paymentCreate } = await rewardHarness({
      role: UserRole.CASHIER,
      status: RewardStatus.APPROVED
    });
    const response = await patch({ status: RewardStatus.PAID, payment: { ...payment, paidAt } });
    expect(response.statusCode).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("出纳付款同时保存付款记录、凭证与审计", async () => {
    const { patch, user, updateMany, paymentCreate, auditCreate } = await rewardHarness({
      role: UserRole.CASHIER,
      status: RewardStatus.APPROVED
    });
    const response = await patch({ status: RewardStatus.PAID, payment });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { status: RewardStatus.PAID } });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(paymentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rewardId, reference: payment.reference, proof: payment.proof })
    }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorId: user.id, resourceId: rewardId })
    }));
  });

  it.each([RewardStatus.CANCELLED, RewardStatus.PAID])("%s 奖励不能重新变成待达标", async (status) => {
    const { patch, updateMany } = await rewardHarness({ status });
    const response = await patch({ status: RewardStatus.PENDING, notes: "尝试重置终态奖励" });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("已付款奖励不能重复登记付款或覆盖凭证", async () => {
    const { patch, updateMany, paymentCreate } = await rewardHarness({ status: RewardStatus.PAID });
    const response = await patch({ status: RewardStatus.PAID, payment });
    expect(response.statusCode).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("已通过财务审批的奖励资源专员不能单独取消", async () => {
    const { patch, updateMany } = await rewardHarness({
      role: UserRole.RESOURCE_SPECIALIST,
      status: RewardStatus.APPROVED
    });
    const response = await patch({ status: RewardStatus.CANCELLED, notes: "重新核查奖励" });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("修改奖励时查询必须带登录态分公司范围", async () => {
    const { patch, findFirst } = await rewardHarness({ role: UserRole.RESOURCE_SPECIALIST });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "本次报名在职满三十天" });
    expect(response.statusCode).toBe(200);
    const where = (findFirst.mock.calls[0]?.[0] as { where: unknown } | undefined)?.where;
    expect(JSON.stringify(where)).toContain(branchId);
    expect(JSON.stringify(where)).toContain(rewardId);
  });

  it("范围外的奖励不能通过已知编号修改", async () => {
    const { patch, updateMany } = await rewardHarness({
      role: UserRole.RESOURCE_SPECIALIST,
      accessible: false
    });
    const response = await patch({ status: RewardStatus.ACHIEVED, notes: "本次报名在职满三十天" });
    expect(response.statusCode).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("并发变更后旧状态请求不能覆盖奖励或新增付款", async () => {
    const { patch, updateMany, paymentCreate, auditCreate } = await rewardHarness({
      role: UserRole.CASHIER,
      status: RewardStatus.APPROVED,
      updateCount: 0
    });
    const response = await patch({ status: RewardStatus.PAID, payment });
    expect(response.statusCode).toBe(409);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: rewardId, status: RewardStatus.APPROVED })
    }));
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
