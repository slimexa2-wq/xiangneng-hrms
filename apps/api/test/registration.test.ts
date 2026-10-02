import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import {
  ApplicationSource,
  EmploymentStatus,
  InterviewStatus,
  JobStatus,
  UserRole,
  type PersonRegistrationInput,
  type SessionUser
} from "@xiangneng/shared";
import { registerPerson } from "../src/services/registration.js";
import { testConfig } from "./helpers.js";
import { AppError } from "../src/errors.js";

const projectId = "30000000-0000-4000-8000-000000000001";
const jobDemandId = "40000000-0000-4000-8000-000000000001";
const supplierId = "50000000-0000-4000-8000-000000000001";

function session(input: Partial<SessionUser>): SessionUser {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    username: "operator",
    displayName: "运营",
    role: UserRole.PROJECT_OPERATOR,
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: "现场运营人员",
    projectIds: [projectId],
    permissions: [],
    ...input
  };
}

function request(user: SessionUser): FastifyRequest {
  return {
    id: "test-request",
    ip: "127.0.0.1",
    headers: {},
    sessionUser: user
  } as unknown as FastifyRequest;
}

function registrationStore() {
  const people: Array<Record<string, unknown>> = [];
  const applications: Array<Record<string, unknown>> = [];
  const referrals: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const id = (prefix: string) => `${prefix}0000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`.slice(0, 36);
  const job = {
    id: jobDemandId,
    projectId,
    title: "生产操作员",
    status: JobStatus.RECRUITING,
    deadline: new Date(Date.now() + 86_400_000),
    referralPolicy: null
  };
  const tx: Record<string, unknown> = {
    $executeRaw: async () => 0,
    jobDemand: { findUnique: async () => job },
    project: { findFirst: async () => ({ id: projectId }) },
    supplier: { findUnique: async () => ({ id: supplierId, isActive: true }) },
    supplierProject: { findUnique: async () => ({ supplierId, projectId }) },
    user: {
      findUnique: async () => ({ id: "60000000-0000-4000-8000-000000000003", isActive: true, employeeType: "普通员工" }),
      findMany: async () => []
    },
    person: {
      findUnique: async (raw: unknown) => people.find((person) => person.idCard === (raw as { where: { idCard: string } }).where.idCard) ?? null,
      create: async (raw: unknown) => {
        const data = (raw as { data: Record<string, unknown> }).data;
        const person = {
          id: id("7"),
          status: EmploymentStatus.APPLICANT,
          interviewStatus: InterviewStatus.PENDING_ARRIVAL,
          insuranceTypes: [],
          onboardDate: null,
          offboardDate: null,
          offboardReason: null,
          employeeNo: null,
          supplierPolicyId: null,
          supplierPolicySnapshot: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        people.push(person);
        return person;
      },
      update: async (raw: unknown) => {
        const { where, data } = raw as { where: { id: string }; data: Record<string, unknown> };
        const person = people.find((item) => item.id === where.id);
        if (!person) throw new Error("person missing");
        for (const [key, value] of Object.entries(data)) if (value !== undefined) person[key] = value;
        return person;
      }
    },
    personStatusLog: { create: async () => ({ id: id("8") }) },
    application: {
      findFirst: async (raw: unknown) => {
        const where = (raw as { where: Record<string, unknown> }).where;
        return [...applications].reverse().find((item) =>
          item.personId === where.personId &&
          item.jobDemandId === where.jobDemandId &&
          item.source === where.source &&
          item.supplierId === where.supplierId &&
          item.recommenderUserId === where.recommenderUserId
        ) ?? null;
      },
      create: async (raw: unknown) => {
        const record = { id: id("9"), appliedAt: new Date(), updatedAt: new Date(), ...((raw as { data: Record<string, unknown> }).data) };
        applications.push(record);
        return record;
      },
      update: async (raw: unknown) => {
        const { where, data } = raw as { where: { id: string }; data: Record<string, unknown> };
        const record = applications.find((item) => item.id === where.id);
        if (!record) throw new Error("application missing");
        Object.assign(record, data);
        return record;
      }
    },
    referralRecord: {
      findUnique: async (raw: unknown) => {
        const key = (raw as { where: { personId_jobDemandId: { personId: string; jobDemandId: string } } }).where.personId_jobDemandId;
        return referrals.find((item) => item.personId === key.personId && item.jobDemandId === key.jobDemandId) ?? null;
      },
      upsert: async (raw: unknown) => {
        const input = raw as { where: { applicationId: string }; create: Record<string, unknown> };
        const existing = referrals.find((item) => item.applicationId === input.where.applicationId);
        if (existing) return existing;
        const record = { id: id("a"), createdAt: new Date(), ...input.create };
        referrals.push(record);
        return record;
      }
    },
    referralReward: { upsert: async () => ({ id: id("b") }) },
    auditLog: { create: async () => ({ id: id("c") }) },
    notification: { createMany: async () => ({ count: 0 }) }
  };
  const prisma = {
    ...tx,
    $transaction: async (callback: (client: unknown) => unknown) => callback(tx)
  } as unknown as PrismaClient;
  return { prisma, people, applications, referrals, tx, job };
}

const baseInput: PersonRegistrationInput = {
  name: "张三",
  idCard: "510101199001011234",
  phone: "13800138000",
  projectId,
  jobDemandId,
  jobTitle: "生产操作员",
  source: ApplicationSource.OPERATOR
};

function firstSeekerStore() {
  const store = registrationStore();
  const seeker = session({ role: UserRole.JOB_SEEKER, personId: null, username: "wx_new" });
  const account = { id: seeker.id, role: UserRole.JOB_SEEKER, isActive: true, personId: null as string | null, displayName: "微信求职者" };
  const bindings: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const behavior = { bindingCount: 1 };
  const delegate = store.tx.user as { findUnique: (raw: unknown) => Promise<unknown>; updateMany: (raw: unknown) => Promise<{ count: number }> };
  const findRecommender = delegate.findUnique;
  delegate.findUnique = async (raw) => (raw as { where: { id: string } }).where.id === seeker.id ? { ...account } : findRecommender(raw);
  delegate.updateMany = async (raw) => {
    const binding = raw as (typeof bindings)[number];
    bindings.push(binding);
    if (behavior.bindingCount === 1) Object.assign(account, binding.data);
    return { count: behavior.bindingCount };
  };
  Object.assign(store.prisma, { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const saved = { people: structuredClone(store.people), applications: structuredClone(store.applications), referrals: structuredClone(store.referrals), account: { ...account } };
    try { return await callback(store.tx); } catch (error) {
      store.people.splice(0, store.people.length, ...saved.people);
      store.applications.splice(0, store.applications.length, ...saved.applications);
      store.referrals.splice(0, store.referrals.length, ...saved.referrals);
      Object.assign(account, saved.account);
      throw error;
    }
  } });
  return { ...store, seeker, account, bindings, behavior };
}

describe("统一人员档案与报名来源", () => {
  it("首次求职者报名原子创建和绑定档案，旧session再次报名按DB身份幂等", async () => {
    const store = firstSeekerStore();
    const first = await registerPerson(store.prisma, testConfig, request(store.seeker), { ...baseInput, source: ApplicationSource.SELF, consent: true }, store.seeker);
    expect(store.account.personId).toBe(first.person.id);
    expect(store.account.role).toBe(UserRole.JOB_SEEKER);
    expect(store.bindings[0]?.where).toMatchObject({ id: store.seeker.id, personId: null, isActive: true, role: UserRole.JOB_SEEKER });
    expect(store.bindings[0]?.data).toEqual({ personId: first.person.id, displayName: baseInput.name });
    await registerPerson(store.prisma, testConfig, request(store.seeker), baseInput, store.seeker);
    expect(store.people).toHaveLength(1);
    expect(store.applications).toHaveLength(1);
    expect(store.bindings).toHaveLength(1);
    await expect(registerPerson(store.prisma, testConfig, request(store.seeker), { ...baseInput, idCard: "510101199101011234" }, store.seeker))
      .rejects.toMatchObject({ statusCode: 403, code: "PERSON_IDENTITY_MISMATCH" });
    expect(store.people).toHaveLength(1);
  });

  it("首次求职者不能凭已有身份证认领档案或覆盖资料", async () => {
    const store = firstSeekerStore();
    const operator = session({});
    await registerPerson(store.prisma, testConfig, request(operator), baseInput, operator);
    await expect(registerPerson(store.prisma, testConfig, request(store.seeker), { ...baseInput, name: "冒用姓名", phone: "13900139000" }, store.seeker))
      .rejects.toMatchObject({ statusCode: 403, code: "PERSON_IDENTITY_MISMATCH" });
    expect(store.account.personId).toBeNull();
    expect(store.bindings).toHaveLength(0);
    expect(store.people[0]).toMatchObject({ name: baseInput.name, phone: baseInput.phone });
    expect(store.applications).toHaveLength(1);
  });

  it("档案绑定CAS冲突回滚新建人员，不留下报名或孤立档案", async () => {
    const store = firstSeekerStore();
    store.behavior.bindingCount = 0;
    await expect(registerPerson(store.prisma, testConfig, request(store.seeker), baseInput, store.seeker))
      .rejects.toMatchObject({ statusCode: 409, code: "PERSON_BINDING_CONFLICT" });
    expect(store.people).toHaveLength(0);
    expect(store.applications).toHaveLength(0);
    expect(store.account.personId).toBeNull();
  });

  it("审计失败时首次档案创建和账号绑定一起回滚", async () => {
    const store = firstSeekerStore();
    (store.tx.auditLog as { create: () => Promise<unknown> }).create = async () => { throw new Error("audit store unavailable"); };
    await expect(registerPerson(store.prisma, testConfig, request(store.seeker), baseInput, store.seeker)).rejects.toThrow("audit store unavailable");
    expect(store.people).toHaveLength(0);
    expect(store.applications).toHaveLength(0);
    expect(store.account.personId).toBeNull();
  });
  it("同人同岗绑定首位推荐人，重复报名不创建第二次奖励或允许抢推荐", async () => {
    const store = registrationStore();
    const first = session({ role: UserRole.EMPLOYEE, id: "60000000-0000-4000-8000-000000000003" });
    const second = session({ role: UserRole.EMPLOYEE, id: "60000000-0000-4000-8000-000000000004" });
    await registerPerson(store.prisma, testConfig, request(first), baseInput, first);
    await registerPerson(store.prisma, testConfig, request(first), baseInput, first);
    await expect(registerPerson(store.prisma, testConfig, request(second), baseInput, second))
      .rejects.toMatchObject({ code: "REFERRER_ALREADY_BOUND", statusCode: 409 });
    expect(store.applications).toHaveLength(1);
    expect(store.referrals).toHaveLength(1);
    expect(store.referrals[0]?.recommenderUserId).toBe(first.id);
  });

  it("身份证关联本人或内部员工时禁止自荐", async () => {
    const store = registrationStore();
    const employee = session({ role: UserRole.EMPLOYEE });
    (store.tx.user as { findUnique: () => unknown }).findUnique = async () => ({
      id: employee.id, isActive: true, employeeType: "普通员工", internalEmployee: { idCard: baseInput.idCard }
    });
    await expect(registerPerson(store.prisma, testConfig, request(employee), baseInput, employee))
      .rejects.toMatchObject({ code: "SELF_REFERRAL_NOT_ALLOWED", statusCode: 409 });
    expect(store.people).toHaveLength(0);
  });

  it("报名时冻结奖励金额与满期天数，政策变更不覆盖原始快照", async () => {
    const store = registrationStore();
    const employee = session({ role: UserRole.EMPLOYEE });
    const policy = {
      id: "80000000-0000-4000-8000-000000000001", name: "在岗推荐", version: 1,
      type: "EMPLOYEE_REFERRAL", amount: 600, retentionDays: 30, isActive: true, employeeType: "普通员工",
      achievementConditions: "在岗满30天后审核", exclusionConditions: "自荐不计奖",
      effectiveAt: new Date("2020-01-01"), expiresAt: null
    };
    Object.assign(store.job, { referralPolicy: policy });
    await registerPerson(store.prisma, testConfig, request(employee), baseInput, employee);
    Object.assign(policy, { amount: 900, retentionDays: 60, version: 2 });
    await registerPerson(store.prisma, testConfig, request(employee), baseInput, employee);
    expect(store.referrals).toHaveLength(1);
    expect(store.referrals[0]?.policySnapshot).toMatchObject({ amount: "600", retentionDays: 30, version: 1 });
  });

  it("员工本人自主报名保留SELF来源，不触发自荐奖励", async () => {
    const store = registrationStore();
    const operator = session({});
    await registerPerson(store.prisma, testConfig, request(operator), baseInput, operator);
    const employee = session({ role: UserRole.EMPLOYEE, personId: store.people[0]!.id as string });
    await registerPerson(store.prisma, testConfig, request(employee), { ...baseInput, source: ApplicationSource.SELF }, employee);
    expect(store.applications[1]?.source).toBe(ApplicationSource.SELF);
    expect(store.referrals).toHaveLength(0);
  });
  it("运营、供应商、员工推荐三入口只建立一份人员主档并保留三条来源报名", async () => {
    const store = registrationStore();
    const operator = session({});
    await registerPerson(store.prisma, testConfig, request(operator), baseInput, operator);
    const supplier = session({
      id: "60000000-0000-4000-8000-000000000002",
      username: "supplier",
      role: UserRole.SUPPLIER,
      supplierId,
      employeeType: null
    });
    await registerPerson(store.prisma, testConfig, request(supplier), { ...baseInput, source: ApplicationSource.SUPPLIER }, supplier);
    const employee = session({
      id: "60000000-0000-4000-8000-000000000003",
      username: "employee",
      role: UserRole.EMPLOYEE,
      personId: "60000000-0000-4000-8000-000000000099",
      employeeType: "普通员工"
    });
    await registerPerson(store.prisma, testConfig, request(employee), { ...baseInput, source: ApplicationSource.REFERRAL }, employee);

    expect(store.people).toHaveLength(1);
    expect(store.applications).toHaveLength(3);
    expect(store.applications.map((item) => item.source)).toEqual([
      ApplicationSource.OPERATOR,
      ApplicationSource.SUPPLIER,
      ApplicationSource.REFERRAL
    ]);
    expect(new Set(store.applications.map((item) => item.personId)).size).toBe(1);
    expect(store.referrals).toHaveLength(1);
  });

  it("分子公司负责人不能把人员写入其他分公司项目", async () => {
    const store = registrationStore();
    (store.tx.project as { findFirst: () => Promise<null> }).findFirst = async () => null;
    const branchManager = session({ role: UserRole.BRANCH_MANAGER, branchId: "30000000-0000-4000-8000-000000000099", projectIds: [] });
    await expect(registerPerson(store.prisma, testConfig, request(branchManager), baseInput, branchManager))
      .rejects.toMatchObject<AppError>({ code: "OUT_OF_SCOPE", statusCode: 403 });
  });

  it("匿名老候选人重复报名同一岗位时只新增一条 SELF 报名且不覆盖人员主档", async () => {
    const store = registrationStore();
    const operator = session({});
    await registerPerson(store.prisma, testConfig, request(operator), baseInput, operator);
    const original = { name: store.people[0]?.name, phone: store.people[0]?.phone, projectId: store.people[0]?.projectId };
    const publicInput = { ...baseInput, name: "伪造姓名", phone: "13900139000", source: ApplicationSource.SELF };

    await registerPerson(store.prisma, testConfig, request(operator), publicInput, null);
    await registerPerson(store.prisma, testConfig, request(operator), publicInput, null);

    expect(store.people).toHaveLength(1);
    expect({ name: store.people[0]?.name, phone: store.people[0]?.phone, projectId: store.people[0]?.projectId }).toEqual(original);
    expect(store.applications).toHaveLength(2);
    expect(store.applications.filter((item) => item.source === ApplicationSource.SELF)).toHaveLength(1);
  });
});
