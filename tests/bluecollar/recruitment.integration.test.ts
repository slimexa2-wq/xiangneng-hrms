import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, type UserRole } from '../../apps/api/src/generated/prisma/client.js';
import { buildApp } from '../../apps/api/src/app.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { passwordHash, login } from '../../apps/api/test/helpers.js';

// Deliberately refuse the normal application DATABASE_URL and all remote hosts.
// These tests create synthetic records and may only run against the dedicated QA DB.
const databaseUrl = process.env.BLUECOLLAR_QA_DATABASE_URL;
if (!databaseUrl) throw new Error('Set BLUECOLLAR_QA_DATABASE_URL to the dedicated local QA database');
const database = new URL(databaseUrl);
if (database.hostname !== '127.0.0.1' || database.port !== '55432' || database.pathname !== '/xiangneng_bluecollar_qa') {
  throw new Error('Integration tests only accept 127.0.0.1:55432/xiangneng_bluecollar_qa');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let app: Awaited<ReturnType<typeof buildApp>>;
let fixture: Awaited<ReturnType<typeof createFixture>>;
let requestNumber = 0;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function candidate() {
  const suffix = (BigInt(`0x${randomUUID().replaceAll('-', '')}`) % 1_000_000_000_000n).toString().padStart(12, '0');
  return {
    name: `蓝领QA候选人${suffix.slice(-4)}`,
    idCard: `100000${suffix}`,
    phone: `100${suffix.slice(-8)}`,
    projectId: fixture.projectA.id,
    jobDemandId: fixture.jobA.id,
    jobTitle: fixture.jobA.title,
    consent: true,
  };
}

async function request(method: 'GET' | 'POST' | 'PATCH', url: string, token?: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: payload as Record<string, unknown> | undefined,
    remoteAddress: `127.0.1.${++requestNumber}`,
  });
}

async function createFixture() {
  const tag = `qa-${randomUUID().slice(0, 8)}`;
  const hash = await passwordHash();
  const branchA = await prisma.branch.create({ data: { name: `${tag}-成都分公司` } });
  const branchB = await prisma.branch.create({ data: { name: `${tag}-宜宾分公司` } });
  const projectA = await prisma.project.create({ data: { name: `${tag}-成都仓储`, branchId: branchA.id, status: 'ACTIVE' } });
  const projectB = await prisma.project.create({ data: { name: `${tag}-宜宾制造`, branchId: branchB.id, status: 'ACTIVE' } });
  const makeUser = (name: string, role: UserRole, branchId?: string, projectId?: string) => prisma.user.create({
    data: {
      username: `${tag}-${name}`,
      displayName: `${tag}-${name}`,
      passwordHash: hash,
      role,
      branchId,
      employeeType: '普通员工',
      projectLinks: projectId ? { create: { projectId } } : undefined,
    },
  });
  const [admin, operator, employee, otherEmployee, resource, otherResource, finance, cashier] = await Promise.all([
    makeUser('admin', 'SYSTEM_ADMIN'),
    makeUser('operator', 'PROJECT_OPERATOR', undefined, projectA.id),
    makeUser('employee', 'EMPLOYEE'),
    makeUser('other-employee', 'EMPLOYEE'),
    makeUser('resource', 'RESOURCE_SPECIALIST', branchA.id),
    makeUser('other-resource', 'RESOURCE_SPECIALIST', branchB.id),
    makeUser('finance', 'FINANCE_REVIEWER', branchA.id),
    makeUser('cashier', 'CASHIER', branchA.id),
  ]);
  const policy = await prisma.policy.create({ data: {
    name: `${tag}-推荐满30天奖励`,
    type: 'EMPLOYEE_REFERRAL',
    projectId: projectA.id,
    employeeType: '普通员工',
    amount: 800,
    retentionDays: 30,
    achievementConditions: '本次报名入职满30天；须核实考勤，达标后离职仍可申请审核',
    exclusionConditions: '自荐或重复推荐不享受奖励',
    effectiveAt: daysAgo(365),
    version: 1,
  } });
  const jobData = {
    title: `${tag}-仓库分拣员`, requiredCount: 20, requirements: '年满18周岁，适应岗位工作',
    salary: '5000–6500元/月', workTime: '排班制', workLocation: '四川成都龙泉驿',
    city: '成都', category: '仓储物流', benefits: ['包住', '餐补'],
    deadline: new Date(Date.now() + 60 * 86_400_000),
  };
  const jobA = await prisma.jobDemand.create({ data: { ...jobData, projectId: projectA.id, referralPolicyId: policy.id } });
  const jobB = await prisma.jobDemand.create({ data: { ...jobData, city: '宜宾', projectId: projectB.id } });
  const token = (user: { id: string; tokenVersion: number }) => app.jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion });
  return {
    tag, branchA, branchB, projectA, projectB, policy, jobA, jobB, admin, employee,
    tokens: { admin: token(admin), operator: token(operator), employee: token(employee), otherEmployee: token(otherEmployee),
      resource: token(resource), otherResource: token(otherResource), finance: token(finance), cashier: token(cashier) },
  };
}

async function createReferral(person = candidate(), recommenderToken = fixture.tokens.employee) {
  const share = await request('POST', '/api/referrals/share-token', recommenderToken, { jobDemandId: fixture.jobA.id });
  expect(share.statusCode, share.body).toBe(201);
  const referralToken = share.json().data.token as string;
  const received = await request('POST', '/api/public/applications', undefined, { ...person, referralToken });
  expect(received.statusCode, received.body).toBe(202);
  const savedPerson = await prisma.person.findUniqueOrThrow({ where: { idCard: person.idCard } });
  const referral = await prisma.referralRecord.findUniqueOrThrow({
    where: { personId_jobDemandId: { personId: savedPerson.id, jobDemandId: fixture.jobA.id } },
    include: { reward: true, application: true },
  });
  expect(referral.reward).not.toBeNull();
  return { person: savedPerson, referral, reward: referral.reward!, referralToken, received, input: person };
}

async function onboardReferral(days = 31) {
  const result = await createReferral();
  const interview = await request('PATCH', `/api/applications/${result.referral.applicationId}/interview`, fixture.tokens.operator,
    { status: 'PASSED', notes: '测试面试通过' });
  expect(interview.statusCode, interview.body).toBe(200);
  const onboard = await request('PATCH', `/api/people/${result.person.id}/onboard`, fixture.tokens.operator,
    { onboardDate: daysAgo(days).toISOString(), insuranceTypes: [] });
  expect(onboard.statusCode, onboard.body).toBe(200);
  return result;
}

async function approveReward(id: string) {
  const achieved = await request('PATCH', `/api/referral-rewards/${id}`, fixture.tokens.resource,
    { status: 'ACHIEVED', notes: '已核验本次报名入职满30天，考勤符合原始规则' });
  expect(achieved.statusCode, achieved.body).toBe(200);
  const approved = await request('PATCH', `/api/referral-rewards/${id}`, fixture.tokens.finance,
    { status: 'APPROVED', notes: '已核验原始政策、奖励金额和推荐关系' });
  expect(approved.statusCode, approved.body).toBe(200);
}

function payment(reference = `QA-${randomUUID()}`) {
  return { reference, proof: 'https://example.test/synthetic-payment-proof.pdf', paidAt: new Date().toISOString() };
}

beforeAll(async () => {
  await prisma.$connect();
  app = await buildApp({ prisma, logger: { level: 'error' }, config: loadConfig({
    NODE_ENV: 'test', DATABASE_URL: databaseUrl,
    JWT_SECRET: 'bluecollar-qa-local-only-secret-over-thirty-two-characters',
    UPLOAD_DIR: '/tmp/xiangneng-bluecollar-qa-uploads', AI_DEMO_MODE: 'false',
  }) });
  await app.ready();
});

beforeEach(async () => { fixture = await createFixture(); });
afterAll(async () => { if (app) await app.close(); await prisma.$disconnect(); });

describe('蓝领招聘真实 PostgreSQL 集成', () => {
  it('迁移后的数据库健康、真实账号登录、岗位发布与项目权限一致', async () => {
    const health = await request('GET', '/health');
    expect(health.statusCode).toBe(200);
    const token = await login(app, fixture.admin.username);
    expect(token).toBeTruthy();
    const payload = { projectId: fixture.projectA.id, title: `${fixture.tag}-普工`, requiredCount: 10,
      requirements: '适应岗位工作', salary: '5000–6500元/月', workTime: '两班倒', workLocation: '四川成都',
      city: '成都', category: '工厂普工', benefits: ['包吃', '包住'], deadline: new Date(Date.now() + 86_400_000).toISOString(),
      referralPolicyId: fixture.policy.id };
    const created = await request('POST', '/api/job-demands', fixture.tokens.operator, payload);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data).toMatchObject({ city: '成都', category: '工厂普工', benefits: ['包吃', '包住'] });
    const denied = await request('POST', '/api/job-demands', fixture.tokens.operator, { ...payload, projectId: fixture.projectB.id });
    expect(denied.statusCode).toBe(404);
    const listed = await request('GET', `/api/public/job-demands?projectId=${fixture.projectA.id}`);
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json().data.items.some((job: { id: string }) => job.id === created.json().data.id)).toBe(true);
  });

  it('推荐链接绑定真实推荐人，公开报名不返回人员隐私，重复报名不重复奖励', async () => {
    const result = await createReferral();
    expect(result.received.json().data).toMatchObject({ received: true });
    expect(result.received.body).not.toContain(result.input.idCard);
    expect(result.received.body).not.toContain(result.input.phone);
    expect(result.referral.recommenderUserId).toBe(fixture.employee.id);
    expect(result.referral.policySnapshot).toMatchObject({ amount: '800', retentionDays: 30, version: 1 });
    const repeat = await request('POST', '/api/public/applications', undefined,
      { ...result.input, name: '试图覆盖档案', phone: '10000000999', referralToken: result.referralToken });
    expect(repeat.statusCode, repeat.body).toBe(202);
    expect(await prisma.application.count({ where: { personId: result.person.id, jobDemandId: fixture.jobA.id } })).toBe(1);
    expect(await prisma.referralReward.count({ where: { referral: { personId: result.person.id, jobDemandId: fixture.jobA.id } } })).toBe(1);
    const retained = await prisma.person.findUniqueOrThrow({ where: { id: result.person.id } });
    expect(retained.name).toBe(result.input.name);
    expect(retained.phone).toBe(result.input.phone);
    await prisma.policy.update({ where: { id: fixture.policy.id }, data: { amount: 1200, retentionDays: 60, version: 2 } });
    const snapshot = await prisma.referralRecord.findUniqueOrThrow({ where: { id: result.referral.id }, include: { reward: true } });
    expect(snapshot.policySnapshot).toMatchObject({ amount: '800', retentionDays: 30, version: 1 });
    expect(snapshot.reward?.amount.toString()).toBe('800');
    const other = await request('GET', '/api/referral-rewards/me', fixture.tokens.otherEmployee);
    expect(other.statusCode).toBe(200);
    expect(other.json().data.some((reward: { id: string }) => reward.id === result.reward.id)).toBe(false);
  });

  it('暂停、过期岗位及跨岗位推荐链接不能报名或创建奖励', async () => {
    const share = await request('POST', '/api/referrals/share-token', fixture.tokens.employee, { jobDemandId: fixture.jobA.id });
    expect(share.statusCode).toBe(201);
    const mismatch = await request('POST', '/api/public/applications', undefined,
      { ...candidate(), jobDemandId: fixture.jobB.id, projectId: fixture.projectB.id, referralToken: share.json().data.token });
    expect(mismatch.statusCode).toBe(400);
    for (const data of [{ status: 'PAUSED' as const }, { status: 'RECRUITING' as const, deadline: daysAgo(1) }]) {
      await prisma.jobDemand.update({ where: { id: fixture.jobA.id }, data });
      const person = candidate();
      const response = await request('POST', '/api/public/applications', undefined, person);
      expect(response.statusCode, response.body).toBe(409);
      expect(await prisma.person.findUnique({ where: { idCard: person.idCard } })).toBeNull();
    }
  });

  it('不同推荐人不能对同一人同一岗位争抢第二份奖励，伪造公开推荐人不生效', async () => {
    const result = await createReferral();
    const share = await request('POST', '/api/referrals/share-token', fixture.tokens.otherEmployee, { jobDemandId: fixture.jobA.id });
    expect(share.statusCode).toBe(201);
    const duplicate = await request('POST', '/api/public/applications', undefined,
      { ...result.input, referralToken: share.json().data.token });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(await prisma.application.count({ where: { personId: result.person.id, jobDemandId: fixture.jobA.id } })).toBe(1);
    expect(await prisma.referralReward.count({ where: { referral: { personId: result.person.id, jobDemandId: fixture.jobA.id } } })).toBe(1);
    const forged = candidate();
    const forgedResponse = await request('POST', '/api/public/applications', undefined,
      { ...forged, source: 'REFERRAL', recommenderUserId: fixture.employee.id });
    expect(forgedResponse.statusCode, forgedResponse.body).toBe(202);
    const saved = await prisma.person.findUniqueOrThrow({ where: { idCard: forged.idCard }, include: { applications: true, referrals: true } });
    expect(saved.applications[0]?.source).toBe('SELF');
    expect(saved.referrals).toHaveLength(0);
  });

  it('本次报名未满期或提前离职不能确认达标，范围外资源专员和员工不能审核', async () => {
    const result = await onboardReferral(10);
    const url = `/api/referral-rewards/${result.reward.id}`;
    const payload = { status: 'ACHIEVED', notes: '核验本次报名在岗日期和考勤' };
    expect((await request('PATCH', url, undefined, payload)).statusCode).toBe(401);
    expect((await request('PATCH', url, fixture.tokens.employee, payload)).statusCode).toBe(403);
    expect((await request('PATCH', url, fixture.tokens.finance, payload)).statusCode).toBe(403);
    expect((await request('PATCH', url, fixture.tokens.cashier, payload)).statusCode).toBe(403);
    expect((await request('PATCH', url, fixture.tokens.otherResource, payload)).statusCode).toBe(404);
    expect((await request('PATCH', url, fixture.tokens.resource, payload)).statusCode).toBe(409);
    const otherList = await request('GET', '/api/referral-rewards', fixture.tokens.otherResource);
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().data.items.some((reward: { id: string }) => reward.id === result.reward.id)).toBe(false);
    await prisma.application.update({ where: { id: result.referral.applicationId }, data: {
      employmentStatus: 'LEFT', onboardDate: daysAgo(40), offboardDate: daysAgo(20),
    } });
    expect((await request('PATCH', url, fixture.tokens.resource, payload)).statusCode).toBe(409);
    expect((await prisma.referralReward.findUniqueOrThrow({ where: { id: result.reward.id } })).status).toBe('PENDING');
  });

  it('按约满期后离职仍可核实达标，不借用其他报名或人员档案日期', async () => {
    const result = await onboardReferral(40);
    const offboard = await request('PATCH', `/api/people/${result.person.id}/offboard`, fixture.tokens.operator,
      { offboardDate: daysAgo(1).toISOString(), offboardReason: '测试本人申请离职', insuranceTypes: [] });
    expect(offboard.statusCode, offboard.body).toBe(200);
    const achieved = await request('PATCH', `/api/referral-rewards/${result.reward.id}`, fixture.tokens.resource,
      { status: 'ACHIEVED', notes: '本次报名入职39天后离职，原始规则满30天已完成；核实考勤及其他条件' });
    expect(achieved.statusCode, achieved.body).toBe(200);
    expect(achieved.json().data.status).toBe('ACHIEVED');
  });

  it('门户我的报名只返回绑定本人的申请，不把推荐他人的记录混入本人报名', async () => {
    const own = await createReferral();
    const other = await createReferral();
    const unbound = await request('GET', '/api/portal/my-applications', fixture.tokens.employee);
    expect(unbound.statusCode, unbound.body).toBe(200);
    expect(unbound.json()).toEqual([]);
    const seeker = await prisma.user.create({ data: {
      username: `${fixture.tag}-job-seeker`, displayName: 'QA求职者', passwordHash: await passwordHash(),
      role: 'JOB_SEEKER', personId: own.person.id,
    } });
    const token = app.jwt.sign({ sub: seeker.id, tokenVersion: seeker.tokenVersion });
    const applications = await request('GET', `/api/portal/my-applications?personId=${other.person.id}`, token);
    expect(applications.statusCode, applications.body).toBe(200);
    expect(applications.json().map((item: { id: string }) => item.id)).toEqual([own.referral.applicationId]);
    expect(applications.body).not.toContain(other.referral.applicationId);
  });

  it('报名→面试→入职→满期→财务审核→出纳凭证发放贯通，状态、证据和审计落库', async () => {
    const result = await onboardReferral();
    const url = `/api/referral-rewards/${result.reward.id}`;
    expect((await request('PATCH', url, fixture.tokens.cashier, { status: 'PAID', payment: payment() })).statusCode).toBe(409);
    const achieved = await request('PATCH', url, fixture.tokens.resource, { status: 'ACHIEVED', notes: '核验原始规则满期考勤' });
    expect(achieved.statusCode, achieved.body).toBe(200);
    expect((await request('PATCH', url, fixture.tokens.resource, { status: 'APPROVED', notes: '审核金额' })).statusCode).toBe(403);
    expect((await request('PATCH', url, fixture.tokens.cashier, { status: 'APPROVED', notes: '审核金额' })).statusCode).toBe(403);
    const approved = await request('PATCH', url, fixture.tokens.finance, { status: 'APPROVED', notes: '政策金额与推荐关系核验通过' });
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await request('PATCH', url, fixture.tokens.finance, { status: 'PAID', payment: payment() })).statusCode).toBe(403);
    expect((await request('PATCH', url, fixture.tokens.cashier, { status: 'PAID' })).statusCode).toBe(400);
    const evidence = payment();
    const paid = await request('PATCH', url, fixture.tokens.cashier, { status: 'PAID', payment: evidence });
    expect(paid.statusCode, paid.body).toBe(200);
    const stored = await prisma.referralReward.findUniqueOrThrow({ where: { id: result.reward.id }, include: { payment: true } });
    expect(stored.status).toBe('PAID');
    expect(stored.approvedById).toBeTruthy();
    expect(stored.achievedAt).not.toBeNull();
    expect(stored.approvedAt).not.toBeNull();
    expect(stored.paidAt).not.toBeNull();
    expect(stored.payment?.reference).toBe(evidence.reference);
    expect(stored.payment?.proof).toBe(evidence.proof);
    expect(stored.payment?.amount.toString()).toBe('800');
    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'ReferralReward', resourceId: result.reward.id } });
    expect(audits).toHaveLength(3);
    expect((await request('PATCH', url, fixture.tokens.cashier, { status: 'PAID', payment: evidence })).statusCode).toBe(409);
    expect((await request('PATCH', url, fixture.tokens.admin, { status: 'PENDING', notes: '重置终态' })).statusCode).toBe(409);
    expect(await prisma.referralRewardPayment.count({ where: { rewardId: result.reward.id } })).toBe(1);
  });

  it('真实数据库并发付款只有一次成功，并保留唯一付款记录与审计', async () => {
    const result = await onboardReferral();
    await approveReward(result.reward.id);
    const url = `/api/referral-rewards/${result.reward.id}`;
    const results = await Promise.all([
      request('PATCH', url, fixture.tokens.cashier, { status: 'PAID', payment: payment() }),
      request('PATCH', url, fixture.tokens.cashier, { status: 'PAID', payment: payment() }),
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(await prisma.referralRewardPayment.count({ where: { rewardId: result.reward.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceType: 'ReferralReward', resourceId: result.reward.id } })).toBe(3);
  });

  it('真实数据库并发推荐争抢只绑定一名推荐人、一条报名和一份奖励', async () => {
    const person = candidate();
    const shares = await Promise.all([
      request('POST', '/api/referrals/share-token', fixture.tokens.employee, { jobDemandId: fixture.jobA.id }),
      request('POST', '/api/referrals/share-token', fixture.tokens.otherEmployee, { jobDemandId: fixture.jobA.id }),
    ]);
    for (const share of shares) expect(share.statusCode, share.body).toBe(201);
    const results = await Promise.all(shares.map((share) => request('POST', '/api/public/applications', undefined,
      { ...person, referralToken: share.json().data.token })));
    expect(results.map((response) => response.statusCode).sort()).toEqual([202, 409]);
    const stored = await prisma.person.findUniqueOrThrow({ where: { idCard: person.idCard }, include: { applications: true, referrals: true } });
    expect(stored.applications).toHaveLength(1);
    expect(stored.referrals).toHaveLength(1);
    expect(await prisma.referralReward.count({ where: { referral: { personId: stored.id, jobDemandId: fixture.jobA.id } } })).toBe(1);
  });

  it('本人身份使用自己的推荐链接不能生成报名推荐或奖励', async () => {
    const person = candidate();
    const { jobDemandId: _jobDemandId, consent: _consent, ...profile } = person;
    const stored = await prisma.person.create({ data: { ...profile, status: 'ACTIVE', onboardDate: daysAgo(90) } });
    await prisma.user.update({ where: { id: fixture.employee.id }, data: { personId: stored.id } });
    const share = await request('POST', '/api/referrals/share-token', fixture.tokens.employee, { jobDemandId: fixture.jobA.id });
    expect(share.statusCode, share.body).toBe(201);
    const response = await request('POST', '/api/public/applications', undefined, { ...person, referralToken: share.json().data.token });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('SELF_REFERRAL_NOT_ALLOWED');
    expect(await prisma.application.count({ where: { personId: stored.id } })).toBe(0);
    expect(await prisma.referralRecord.count({ where: { personId: stored.id } })).toBe(0);
  });

  it('付款流水号冲突会回滚第二笔奖励状态、付款记录与审计', async () => {
    const first = await onboardReferral();
    const second = await onboardReferral();
    await approveReward(first.reward.id);
    await approveReward(second.reward.id);
    const evidence = payment();
    const paid = await request('PATCH', `/api/referral-rewards/${first.reward.id}`, fixture.tokens.cashier, { status: 'PAID', payment: evidence });
    expect(paid.statusCode, paid.body).toBe(200);
    const conflict = await request('PATCH', `/api/referral-rewards/${second.reward.id}`, fixture.tokens.cashier, { status: 'PAID', payment: evidence });
    expect(conflict.statusCode, conflict.body).toBe(409);
    const retained = await prisma.referralReward.findUniqueOrThrow({ where: { id: second.reward.id }, include: { payment: true } });
    expect(retained.status).toBe('APPROVED');
    expect(retained.paidAt).toBeNull();
    expect(retained.payment).toBeNull();
    expect(await prisma.auditLog.count({ where: { resourceType: 'ReferralReward', resourceId: second.reward.id } })).toBe(2);
  });
});
