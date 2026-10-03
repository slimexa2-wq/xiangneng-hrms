import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { buildApp } from '../../apps/api/src/app.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { passwordHash } from '../../apps/api/test/helpers.js';

const databaseUrl = process.env.BLUECOLLAR_QA_DATABASE_URL;
if (!databaseUrl) throw new Error('Set BLUECOLLAR_QA_DATABASE_URL to the dedicated local QA database');
const database = new URL(databaseUrl);
if (database.hostname !== '127.0.0.1' || database.port !== '55432' || database.pathname !== '/xiangneng_bluecollar_qa') {
  throw new Error('Candidate onboarding tests only accept 127.0.0.1:55432/xiangneng_bluecollar_qa');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let app: Awaited<ReturnType<typeof buildApp>>;
let fixture: Awaited<ReturnType<typeof createFixture>>;
let requestNumber = 0;
const wechatReplies = new Map<string, Record<string, unknown> | string>();
const sessionKey = 'qa-upstream-session-key-must-not-be-stored';

type CandidateSession = {
  token: string;
  user: { id: string; role: string; roles: string[]; personId: string | null; permissions: string[];
    branchId: string | null; supplierId: string | null; projectIds: string[] };
};

function identity() {
  return { code: `qa-code-${randomUUID()}`, openid: `qa-openid-${randomUUID()}` };
}

function candidate(job = fixture.job) {
  const suffix = (BigInt(`0x${randomUUID().replaceAll('-', '')}`) % 1_000_000_000_000n).toString().padStart(12, '0');
  return { name: `QA新求职者${suffix.slice(-4)}`, idCard: `100000${suffix}`, phone: `100${suffix.slice(-8)}`,
    projectId: job.projectId, jobDemandId: job.id, jobTitle: job.title, source: 'SELF', consent: true };
}

async function request(method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) {
  return app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: payload as Record<string, unknown> | undefined, remoteAddress: `127.0.2.${++requestNumber}` });
}

async function createFixture() {
  const tag = `qa-onboarding-${randomUUID().slice(0, 8)}`;
  const branch = await prisma.branch.create({ data: { name: `${tag}-成都分公司` } });
  const project = await prisma.project.create({ data: { branchId: branch.id, name: `${tag}-四川仓储`, status: 'ACTIVE' } });
  const employee = await prisma.user.create({ data: { username: `${tag}-employee`, displayName: 'QA在职推荐人',
    role: 'EMPLOYEE', employeeType: '普通员工', passwordHash: await passwordHash() } });
  const policy = await prisma.policy.create({ data: { name: `${tag}-报名规则`, type: 'EMPLOYEE_REFERRAL',
    projectId: project.id, employeeType: '普通员工', amount: 800, retentionDays: 30,
    achievementConditions: '本次报名入职满30天，其他条件须人工核实', effectiveAt: new Date(Date.now() - 365 * 86_400_000) } });
  const job = await prisma.jobDemand.create({ data: { projectId: project.id, title: `${tag}-分拣员`,
    requiredCount: 20, requirements: '适应岗位工作', salary: '5000元/月', workTime: '排班制',
    workLocation: '四川成都', city: '成都', category: '仓储物流', benefits: ['包住'],
    deadline: new Date(Date.now() + 60 * 86_400_000), referralPolicyId: policy.id } });
  const oldInput = candidate(job);
  const oldPerson = await prisma.person.create({ data: { name: 'QA旧档案本人', idCard: oldInput.idCard,
    phone: oldInput.phone, projectId: project.id, jobTitle: job.title, notes: '原始档案不得由陌生账号覆盖' } });
  const oldApplication = await prisma.application.create({ data: { personId: oldPerson.id, jobDemandId: job.id, source: 'SELF' } });
  return { tag, branch, project, employee, policy, job, oldPerson, oldApplication,
    employeeToken: app.jwt.sign({ sub: employee.id, tokenVersion: employee.tokenVersion }) };
}

async function newSession(subject = identity()) {
  wechatReplies.set(subject.code, { openid: subject.openid, session_key: sessionKey });
  const response = await request('POST', '/api/wechat/auth/login', undefined, { code: subject.code });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.body).not.toContain(sessionKey);
  expect(response.body).not.toContain('passwordHash');
  return { ...subject, ...response.json().data as CandidateSession };
}

beforeAll(async () => {
  await prisma.$connect();
  app = await buildApp({ prisma, logger: { level: 'error' }, config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl,
    JWT_SECRET: 'candidate-onboarding-qa-secret-over-thirty-two-characters',
    UPLOAD_DIR: '/tmp/xiangneng-bluecollar-qa-uploads', AI_DEMO_MODE: 'false',
    WECHAT_MINIAPP_APP_ID: 'qa-mocked-wechat-app-id', WECHAT_MINIAPP_APP_SECRET: 'qa-mocked-wechat-app-secret' }) });
  await app.ready();
});

beforeEach(async () => {
  wechatReplies.clear();
  // Only the WeChat upstream is mocked. Every account, binding, application and
  // transaction below uses the real isolated PostgreSQL database.
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== 'api.weixin.qq.com' || url.pathname !== '/sns/jscode2session') {
      throw new Error('Unexpected external request in isolated candidate onboarding test');
    }
    const reply = wechatReplies.get(url.searchParams.get('js_code') ?? '') ?? { errcode: 40029, errmsg: 'invalid synthetic code' };
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  fixture = await createFixture();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { if (app) await app.close(); await prisma.$disconnect(); });

describe('首次微信求职者真实 PostgreSQL 集成', () => {
  it('未通过微信上游校验或无效JSON不能创建账号或返回登录态', async () => {
    const invalid = identity();
    wechatReplies.set(invalid.code, { openid: invalid.openid, errcode: 40029, errmsg: 'invalid synthetic code' });
    const rejected = await request('POST', '/api/wechat/auth/login', undefined, { code: invalid.code });
    expect(rejected.statusCode, rejected.body).toBe(502);
    expect(rejected.json().data?.token).toBeUndefined();
    expect(await prisma.user.findUnique({ where: { wechatMiniappOpenId: invalid.openid } })).toBeNull();
    const malformed = identity();
    wechatReplies.set(malformed.code, 'synthetic malformed JSON');
    expect((await request('POST', '/api/wechat/auth/login', undefined, { code: malformed.code })).statusCode).toBe(502);
  });

  it('陌生OpenID并发登录仅创建一个最低JOB_SEEKER账号，不赋予管理或推荐权限', async () => {
    const subject = identity();
    const results = await Promise.all([newSession(subject), newSession(subject), newSession(subject)]);
    expect(new Set(results.map((session) => session.user.id)).size).toBe(1);
    const { user } = results[0];
    expect(user).toMatchObject({ role: 'JOB_SEEKER', roles: ['JOB_SEEKER'], personId: null, branchId: null, supplierId: null, projectIds: [] });
    expect(user.permissions.sort()).toEqual(['application:create', 'job:read']);
    expect(await prisma.user.count({ where: { wechatMiniappOpenId: subject.openid } })).toBe(1);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { roleAssignments: true, projectLinks: true, dataScopeBindings: true } });
    expect(stored.personId).toBeNull();
    expect(stored.roleAssignments).toHaveLength(0);
    expect(stored.projectLinks).toHaveLength(0);
    expect(stored.dataScopeBindings).toHaveLength(0);
    expect(JSON.stringify(stored)).not.toContain(sessionKey);
  });

  it('已经停用的微信账号不会被登录upsert重新激活或替换为求职者', async () => {
    const subject = identity();
    const disabled = await prisma.user.create({ data: { username: `${fixture.tag}-disabled`, displayName: 'QA停用账号',
      passwordHash: await passwordHash(), role: 'EMPLOYEE', isActive: false, tokenVersion: 3, wechatMiniappOpenId: subject.openid } });
    wechatReplies.set(subject.code, { openid: subject.openid, session_key: sessionKey });
    const response = await request('POST', '/api/wechat/auth/login', undefined, { code: subject.code });
    expect(response.statusCode, response.body).toBe(401);
    expect(response.json().error.code).toBe('ACCOUNT_DISABLED');
    expect(response.json().data?.token).toBeUndefined();
    const retained = await prisma.user.findUniqueOrThrow({ where: { id: disabled.id } });
    expect(retained).toMatchObject({ isActive: false, role: 'EMPLOYEE', tokenVersion: 3 });
    expect(await prisma.user.count({ where: { wechatMiniappOpenId: subject.openid } })).toBe(1);
  });

  it('空临时微信账号可安全衔接已登录HRMS账号，原临时JWT失效并保留双方审计', async () => {
    const temporary = await newSession();
    const original = await prisma.user.update({ where: { id: temporary.user.id },
      data: { wechatUnionId: `qa-old-union-${randomUUID()}` } });
    expect(original.username).toMatch(/^wx_[a-f0-9]{40}$/);
    const binding = identity();
    const unionid = `qa-bound-union-${randomUUID()}`;
    wechatReplies.set(binding.code, { openid: temporary.openid, unionid, session_key: sessionKey });
    const response = await request('POST', '/api/wechat/bind', fixture.employeeToken, { code: binding.code });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ bound: true });
    const retained = await prisma.user.findUniqueOrThrow({ where: { id: temporary.user.id } });
    expect(retained).toMatchObject({ isActive: false, role: 'JOB_SEEKER', personId: null,
      wechatMiniappOpenId: null, wechatUnionId: null, tokenVersion: original.tokenVersion + 1 });
    const target = await prisma.user.findUniqueOrThrow({ where: { id: fixture.employee.id } });
    expect(target).toMatchObject({ role: 'EMPLOYEE', isActive: true, wechatMiniappOpenId: temporary.openid, wechatUnionId: unionid });
    expect((await request('GET', '/api/auth/me', temporary.token)).statusCode).toBe(401);
    expect((await request('GET', '/api/auth/me', fixture.employeeToken)).json().data.role).toBe('EMPLOYEE');
    const release = await prisma.auditLog.findMany({ where: { resourceId: temporary.user.id, action: 'WECHAT_TEMPORARY_ACCOUNT_RELEASED' } });
    const bound = await prisma.auditLog.findMany({ where: { resourceId: fixture.employee.id, action: 'WECHAT_MINIAPP_BIND' } });
    expect(release).toHaveLength(1);
    expect(bound).toHaveLength(1);
    expect(release[0].actorId).toBe(fixture.employee.id);
    expect(bound[0].after).toMatchObject({ bound: true, transferredTemporaryAccount: true });
    expect(await prisma.user.count({ where: { wechatMiniappOpenId: temporary.openid } })).toBe(1);
    const again = await newSession(temporary);
    expect(again.user).toMatchObject({ id: fixture.employee.id, role: 'EMPLOYEE' });
  });

  it('已有本人档案的微信owner不能转移，双方绑定、角色、token版本及报名保持原样', async () => {
    const owner = await newSession();
    const person = candidate();
    const application = await request('POST', '/api/applications', owner.token, person);
    expect(application.statusCode, application.body).toBe(201);
    const targetBefore = await prisma.user.update({ where: { id: fixture.employee.id }, data: {
      wechatMiniappOpenId: `qa-other-hrms-openid-${randomUUID()}`, wechatUnionId: `qa-other-hrms-union-${randomUUID()}`,
    } });
    const ownerBefore = await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } });
    const code = identity();
    wechatReplies.set(code.code, { openid: owner.openid, session_key: sessionKey });
    const rejected = await request('POST', '/api/wechat/bind', fixture.employeeToken, { code: code.code });
    expect(rejected.statusCode, rejected.body).toBe(409);
    expect(rejected.json().error.code).toBe('WECHAT_ALREADY_BOUND');
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).toEqual(ownerBefore);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: fixture.employee.id } })).toEqual(targetBefore);
    expect((await request('GET', '/api/auth/me', owner.token)).statusCode).toBe(200);
    expect(await prisma.application.count({ where: { personId: ownerBefore.personId! } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: { in: [owner.user.id, fixture.employee.id] },
      action: { in: ['WECHAT_TEMPORARY_ACCOUNT_RELEASED', 'WECHAT_MINIAPP_BIND'] } } })).toBe(0);
  });

  it('首次SELF报名同事务创建全新档案并绑定本人，当前token可立即查看本人报名', async () => {
    const session = await newSession();
    const person = candidate();
    const response = await request('POST', '/api/applications', session.token, person);
    expect(response.statusCode, response.body).toBe(201);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, include: { person: { include: { applications: true, referrals: true } } } });
    expect(stored.role).toBe('JOB_SEEKER');
    expect(stored.personId).toBe(response.json().data.person.id);
    expect(stored.person?.idCard).toBe(person.idCard);
    expect(stored.person?.applications).toHaveLength(1);
    expect(stored.person?.applications[0]).toMatchObject({ source: 'SELF', recommenderUserId: null, supplierId: null });
    expect(stored.person?.referrals).toHaveLength(0);
    const current = await request('GET', '/api/auth/me', session.token);
    expect(current.json().data.personId).toBe(stored.personId);
    const mine = await request('GET', '/api/applications/me', session.token);
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json().data.map((row: { personId: string }) => row.personId)).toEqual([stored.personId]);
    const repeat = await request('POST', '/api/applications', session.token, person);
    expect(repeat.statusCode, repeat.body).toBe(200);
    expect(await prisma.application.count({ where: { personId: stored.personId!, jobDemandId: fixture.job.id } })).toBe(1);
  });

  it('首次带推荐token报名绑定候选人本人及真实推荐人，奖励快照同事务创建', async () => {
    const session = await newSession();
    const share = await request('POST', '/api/referrals/share-token', fixture.employeeToken, { jobDemandId: fixture.job.id });
    expect(share.statusCode, share.body).toBe(201);
    const person = candidate();
    const response = await request('POST', '/api/applications', session.token,
      { ...person, referralToken: share.json().data.token, recommenderUserId: session.user.id });
    expect(response.statusCode, response.body).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    expect(user.personId).toBe(response.json().data.person.id);
    const referral = await prisma.referralRecord.findUniqueOrThrow({ where: { applicationId: response.json().data.application.id }, include: { reward: true } });
    expect(referral.recommenderUserId).toBe(fixture.employee.id);
    expect(referral.personId).toBe(user.personId);
    expect(referral.policySnapshot).toMatchObject({ amount: '800', retentionDays: 30, version: 1 });
    expect(referral.reward?.status).toBe('PENDING');
    expect(referral.reward?.amount.toString()).toBe('800');
  });

  it('陌生账号提交已有身份证不能抢绑或覆盖旧档案，必须人工核实本人', async () => {
    const session = await newSession();
    const before = await prisma.person.findUniqueOrThrow({ where: { id: fixture.oldPerson.id } });
    const response = await request('POST', '/api/applications', session.token,
      { ...candidate(), idCard: fixture.oldPerson.idCard, name: '试图覆盖已有人员', phone: '10000000999' });
    expect(response.statusCode, response.body).toBe(403);
    expect(response.json().error.code).toBe('PERSON_IDENTITY_MISMATCH');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).personId).toBeNull();
    expect(await prisma.person.findUniqueOrThrow({ where: { id: fixture.oldPerson.id } })).toEqual(before);
    expect(await prisma.application.count({ where: { personId: fixture.oldPerson.id } })).toBe(1);
  });

  it('同账号并发提交不同身份证只能绑定一份档案，失败事务不留孤立人员', async () => {
    const session = await newSession();
    const inputs = [candidate(), candidate()];
    const results = await Promise.all(inputs.map((person) => request('POST', '/api/applications', session.token, person)));
    const statuses = results.map((response) => response.statusCode).sort();
    expect(statuses[0], results.map((response) => response.body).join('\n')).toBe(201);
    expect([403, 409]).toContain(statuses[1]);
    const people = await prisma.person.findMany({ where: { idCard: { in: inputs.map((person) => person.idCard) } }, include: { applications: true } });
    expect(people).toHaveLength(1);
    expect(people[0].applications).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).personId).toBe(people[0].id);
  });

  it('不同账号并发争抢同一新身份证，仅成功账号可绑定同一份人员档案', async () => {
    const sessions = await Promise.all([newSession(), newSession()]);
    const person = candidate();
    const results = await Promise.all(sessions.map((session) => request('POST', '/api/applications', session.token, person)));
    expect(results.map((response) => response.statusCode).sort(), results.map((response) => response.body).join('\n')).toEqual([201, 403]);
    const stored = await prisma.person.findUniqueOrThrow({ where: { idCard: person.idCard }, include: { applications: true } });
    expect(stored.applications).toHaveLength(1);
    const users = await prisma.user.findMany({ where: { id: { in: sessions.map((session) => session.user.id) } } });
    expect(users.filter((user) => user.personId === stored.id)).toHaveLength(1);
    expect(users.filter((user) => user.personId === null)).toHaveLength(1);
  });

  it('空本人范围不能读取已有人员的报名、推荐奖励或管理列表', async () => {
    const session = await newSession();
    const mine = await request('GET', `/api/applications/me?personId=${fixture.oldPerson.id}`, session.token);
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json().data).toEqual([]);
    const portal = await request('GET', `/api/portal/my-applications?personId=${fixture.oldPerson.id}`, session.token);
    expect(portal.statusCode, portal.body).toBe(200);
    expect(portal.json()).toEqual([]);
    const rewards = await request('GET', '/api/referral-rewards/me', session.token);
    expect(rewards.statusCode).toBe(200);
    expect(rewards.json().data).toEqual([]);
    expect((await request('GET', '/api/people', session.token)).statusCode).toBe(403);
    expect((await request('GET', '/api/applications', session.token)).statusCode).toBe(403);
    expect((await request('GET', '/api/referral-rewards', session.token)).statusCode).toBe(403);
  });
});
