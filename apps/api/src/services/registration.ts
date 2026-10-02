import type { FastifyRequest } from "fastify";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import {
  ApplicationSource,
  EmploymentStatus,
  JobStatus,
  PolicyType,
  UserRole,
  normalizeIdCard,
  type PersonRegistrationInput,
  type SessionUser
} from "@xiangneng/shared";
import type { AppConfig } from "../config.js";
import { AppError, notFound } from "../errors.js";
import { createKeyNotifications } from "../notifications.js";
import { writeAudit } from "../audit.js";
import { projectWhere } from "../data-scope.js";

export type RegistrationResult = {
  person: Awaited<ReturnType<Prisma.TransactionClient["person"]["findUniqueOrThrow"]>>;
  application: Awaited<ReturnType<Prisma.TransactionClient["application"]["findUnique"]>>;
  deduplicated: boolean;
};

function bindSource(input: PersonRegistrationInput, user: SessionUser | null, trustedReferralUserId?: string): PersonRegistrationInput {
  if (trustedReferralUserId) {
    return { ...input, source: ApplicationSource.REFERRAL, supplierId: null, recommenderUserId: trustedReferralUserId };
  }
  if (!user) return { ...input, source: ApplicationSource.SELF, supplierId: null, recommenderUserId: null };
  switch (user.role) {
    case UserRole.SUPPLIER:
    case UserRole.SUPPLIER_ADMIN:
      if (!user.supplierId) throw new AppError(400, "SUPPLIER_BINDING_REQUIRED", "供应商账号未绑定供应商");
      return { ...input, source: ApplicationSource.SUPPLIER, supplierId: user.supplierId, recommenderUserId: null };
    case UserRole.EMPLOYEE:
    case UserRole.OUTSOURCED_EMPLOYEE:
      if (input.source === ApplicationSource.SELF) return { ...input, supplierId: null, recommenderUserId: null };
      return { ...input, source: ApplicationSource.REFERRAL, supplierId: null, recommenderUserId: user.id };
    case UserRole.JOB_SEEKER:
      return { ...input, source: ApplicationSource.SELF, supplierId: null, recommenderUserId: null };
    case UserRole.PROJECT_OPERATOR:
      return { ...input, source: ApplicationSource.OPERATOR, supplierId: null, recommenderUserId: null };
    default:
      return input;
  }
}

function assertSourceSubject(input: PersonRegistrationInput): void {
  if (input.source === ApplicationSource.SUPPLIER && (!input.supplierId || input.recommenderUserId)) {
    throw new AppError(400, "INVALID_APPLICATION_SOURCE_SUBJECT", "供应商报名必须且只能关联供应商主体");
  }
  if (input.source === ApplicationSource.REFERRAL && (!input.recommenderUserId || input.supplierId)) {
    throw new AppError(400, "INVALID_APPLICATION_SOURCE_SUBJECT", "内部推荐必须且只能关联推荐人");
  }
  if (
    (input.source === ApplicationSource.OPERATOR || input.source === ApplicationSource.SELF)
    && (input.supplierId || input.recommenderUserId)
  ) {
    throw new AppError(400, "INVALID_APPLICATION_SOURCE_SUBJECT", "运营登记或自主报名不能携带供应商/推荐人主体");
  }
}

export async function registerPerson(
  prisma: PrismaClient,
  config: AppConfig,
  request: FastifyRequest,
  input: PersonRegistrationInput,
  user: SessionUser | null,
  trustedReferralUserId?: string
): Promise<RegistrationResult> {
  const bound = bindSource(input, user, trustedReferralUserId);
  assertSourceSubject(bound);
  const idCard = normalizeIdCard(bound.idCard);
  const result = await prisma.$transaction(async (tx) => {
    // Serialize registrations for the same identity, including concurrent public
    // requests, so referral attribution and the person master cannot race.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idCard}))`;
    let currentPersonId = user?.personId ?? null;
    if (user?.role === UserRole.JOB_SEEKER) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"registration-user:" + user.id}))`;
      const account = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, isActive: true, personId: true, role: true } });
      if (!account?.isActive) throw new AppError(401, "ACCOUNT_DISABLED", "该账号已停用，请联系服务人员核实");
      if (account.role !== UserRole.JOB_SEEKER) throw new AppError(409, "ACCOUNT_STATE_CHANGED", "账号身份已变化，请刷新登录后继续");
      currentPersonId = account.personId;
    }
    const job = bound.jobDemandId
      ? await tx.jobDemand.findUnique({
          where: { id: bound.jobDemandId },
          include: { referralPolicy: true }
        })
      : null;
    if (bound.jobDemandId && !job) notFound("招聘需求");
    if (job && (job.status !== JobStatus.RECRUITING || job.deadline < new Date())) {
      throw new AppError(409, "JOB_NOT_OPEN", "该招聘需求当前不可报名");
    }
    if (job && bound.projectId !== job.projectId) {
      throw new AppError(400, "PROJECT_JOB_MISMATCH", "报名项目与招聘需求所属项目不一致");
    }
    if (user && user.role !== UserRole.EMPLOYEE && user.role !== UserRole.OUTSOURCED_EMPLOYEE && user.role !== UserRole.JOB_SEEKER) {
      const allowedProject = await tx.project.findFirst({ where: { AND: [projectWhere(user), { id: bound.projectId }] }, select: { id: true } });
      if (!allowedProject) throw new AppError(403, "OUT_OF_SCOPE", "不能为未授权项目登记人员");
    }
    if (bound.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: bound.supplierId }, select: { id: true, isActive: true } });
      if (!supplier?.isActive) throw new AppError(400, "INVALID_SUPPLIER", "供应商不存在或已停用");
      const projectLink = await tx.supplierProject.findUnique({
        where: { supplierId_projectId: { supplierId: bound.supplierId, projectId: bound.projectId } }
      });
      if (!projectLink) throw new AppError(403, "SUPPLIER_PROJECT_OUT_OF_SCOPE", "供应商未关联该项目，不能报送人员");
    }
    let recommender = null;
    if (bound.recommenderUserId) {
      recommender = await tx.user.findUnique({ where: { id: bound.recommenderUserId }, select: {
        id: true, isActive: true, employeeType: true, personId: true,
        person: { select: { idCard: true } }, internalEmployee: { select: { idCard: true } }
      } });
      if (!recommender?.isActive) throw new AppError(400, "INVALID_RECOMMENDER", "推荐人不存在或已停用");
      if (normalizeIdCard(recommender.person?.idCard ?? recommender.internalEmployee?.idCard ?? "") === idCard) {
        throw new AppError(409, "SELF_REFERRAL_NOT_ALLOWED", "本人报名不能作为推荐领取奖励");
      }
    }
    const existing = await tx.person.findUnique({ where: { idCard } });
    if (recommender?.personId && recommender.personId === existing?.id) {
      throw new AppError(409, "SELF_REFERRAL_NOT_ALLOWED", "本人报名不能作为推荐领取奖励");
    }
    const existingReferral = existing && job
      ? await tx.referralRecord.findUnique({ where: { personId_jobDemandId: { personId: existing.id, jobDemandId: job.id } } })
      : null;
    if (bound.recommenderUserId && existingReferral && existingReferral.recommenderUserId !== bound.recommenderUserId) {
      throw new AppError(409, "REFERRER_ALREADY_BOUND", "该人员在此岗位已绑定推荐人，不能重复计奖或更换推荐人");
    }
    const preserveExistingPublicProfile = !user && Boolean(existing);
    const firstSelfProfile = user?.role === UserRole.JOB_SEEKER && !currentPersonId && !existing && Boolean(job)
      && (bound.source === ApplicationSource.SELF || Boolean(trustedReferralUserId));
    if (user?.role === UserRole.JOB_SEEKER && !firstSelfProfile && (!currentPersonId || existing?.id !== currentPersonId)) {
      throw new AppError(403, "PERSON_IDENTITY_MISMATCH", "已有人员档案需要服务人员核实绑定，不能凭身份证直接认领或报名他人身份");
    }
    if (bound.source === ApplicationSource.SELF && user
      && (user.role === UserRole.EMPLOYEE || user.role === UserRole.OUTSOURCED_EMPLOYEE)
      && (!user.personId || existing?.id !== user.personId)) {
      throw new AppError(403, "PERSON_IDENTITY_MISMATCH", "本人自主报名只能使用当前账号绑定的人员身份");
    }
    if (user && (user.role === UserRole.SUPPLIER || user.role === UserRole.SUPPLIER_ADMIN) && existing?.supplierId && existing.supplierId !== user.supplierId) {
      throw new AppError(409, "PERSON_OWNED_BY_OTHER_SUPPLIER", "该人员已归属其他供应商，不能跨供应商覆盖档案");
    }
    const shouldRestart = existing?.status === EmploymentStatus.LEFT && !preserveExistingPublicProfile;
    const person = preserveExistingPublicProfile && existing
      ? existing
      : existing
      ? await tx.person.update({
          where: { id: existing.id },
          data: {
            name: bound.name,
            phone: bound.phone,
            projectId: shouldRestart ? bound.projectId : undefined,
            jobTitle: shouldRestart ? (job?.title ?? bound.jobTitle) : undefined,
            interviewDate: shouldRestart ? bound.interviewDate : undefined,
            supplierId: shouldRestart || (existing.status !== EmploymentStatus.ACTIVE && !existing.supplierId && bound.supplierId)
              ? bound.supplierId
              : undefined,
            recommenderUserId: shouldRestart || (existing.status !== EmploymentStatus.ACTIVE && !existing.recommenderUserId && bound.recommenderUserId)
              ? bound.recommenderUserId
              : undefined,
            emergencyContactName: bound.emergencyContactName,
            emergencyContactPhone: bound.emergencyContactPhone,
            emergencyContactRelation: bound.emergencyContactRelation,
            status: shouldRestart ? EmploymentStatus.APPLICANT : undefined,
            interviewStatus: shouldRestart ? "PENDING_ARRIVAL" : undefined,
            onboardDate: shouldRestart ? null : undefined,
            offboardDate: shouldRestart ? null : undefined,
            offboardReason: shouldRestart ? null : undefined,
            employeeNo: shouldRestart ? null : undefined,
            insuranceTypes: shouldRestart ? [] : undefined,
            supplierPolicyId: shouldRestart ? null : undefined,
            supplierPolicySnapshot: shouldRestart ? Prisma.JsonNull : undefined,
            notes: bound.notes ?? existing.notes
          }
        })
      : await tx.person.create({
          data: {
            name: bound.name,
            idCard,
            phone: bound.phone,
            projectId: bound.projectId,
            jobTitle: job?.title ?? bound.jobTitle,
            interviewDate: bound.interviewDate,
            supplierId: bound.supplierId,
            recommenderUserId: bound.recommenderUserId,
            emergencyContactName: bound.emergencyContactName,
            emergencyContactPhone: bound.emergencyContactPhone,
            emergencyContactRelation: bound.emergencyContactRelation,
            notes: bound.notes
          }
        });

    if (firstSelfProfile && user) {
      const binding = await tx.user.updateMany({
        where: { id: user.id, personId: null, isActive: true, role: UserRole.JOB_SEEKER },
        data: { personId: person.id, displayName: person.name }
      });
      if (binding.count !== 1) throw new AppError(409, "PERSON_BINDING_CONFLICT", "本人档案已被其他请求绑定，请刷新登录后重试");
      await writeAudit(tx, request, { action: "JOB_SEEKER_PROFILE_CREATED", resourceType: "User", resourceId: user.id,
        after: { personId: person.id, consentConfirmed: bound.consent === true } });
    }

    if (!existing || shouldRestart) {
      await tx.personStatusLog.create({
        data: {
          personId: person.id,
          fromStatus: existing?.status,
          toStatus: person.status,
          interviewStatus: person.interviewStatus,
          action: existing ? "REGISTRATION_MERGED" : "REGISTERED",
          notes: existing ? "身份证号命中已有档案，本次报名已归并" : bound.notes,
          actorId: user?.id
        }
      });
    }

    let application = null;
    if (job) {
      const latestApplication = await tx.application.findFirst({
        where: {
          personId: person.id,
          jobDemandId: job.id,
          source: bound.source,
          supplierId: bound.source === ApplicationSource.SUPPLIER ? bound.supplierId : null,
          recommenderUserId: bound.source === ApplicationSource.REFERRAL ? bound.recommenderUserId : null
        },
        orderBy: { appliedAt: "desc" }
      });
      if (!latestApplication || latestApplication.employmentStatus === EmploymentStatus.LEFT) {
        application = await tx.application.create({
          data: {
          personId: person.id,
          jobDemandId: job.id,
          source: bound.source,
          supplierId: bound.supplierId,
          recommenderUserId: bound.recommenderUserId,
          interviewDate: bound.interviewDate,
          interviewStatus: "PENDING_ARRIVAL",
          employmentStatus: EmploymentStatus.APPLICANT
          }
        });
      } else {
        application = await tx.application.update({
          where: { id: latestApplication.id },
          data: {
            updatedAt: new Date()
          }
        });
      }
      if (bound.source === ApplicationSource.REFERRAL && bound.recommenderUserId && !existingReferral) {
        const policy = job.referralPolicy;
        if (policy && policy.type !== PolicyType.EMPLOYEE_REFERRAL) {
          throw new AppError(400, "INVALID_REFERRAL_POLICY", "招聘需求绑定的不是内部推荐政策");
        }
        if (policy) {
          const employeeType = recommender?.employeeType ?? "普通员工";
          const now = new Date();
          if (!policy.isActive || policy.effectiveAt > now || (policy.expiresAt && policy.expiresAt.getTime() + 86_400_000 <= now.getTime()) || policy.employeeType !== employeeType) {
            throw new AppError(409, "REFERRAL_POLICY_NOT_APPLICABLE", "该岗位绑定的内部推荐政策不适用于当前推荐人或已失效");
          }
        }
        await tx.referralRecord.upsert({
          where: { applicationId: application.id },
          create: {
            applicationId: application.id,
            personId: person.id,
            jobDemandId: job.id,
            recommenderUserId: bound.recommenderUserId,
            policyId: policy?.id,
            policySnapshot: policy ? {
              id: policy.id,
              name: policy.name,
              version: policy.version,
              amount: policy.amount.toString(),
              retentionDays: policy.retentionDays,
              achievementConditions: policy.achievementConditions,
              exclusionConditions: policy.exclusionConditions,
              effectiveAt: policy.effectiveAt.toISOString(),
              expiresAt: policy.expiresAt?.toISOString() ?? null,
              employeeType: policy.employeeType
            } : undefined,
            reward: policy
              ? { create: { policyId: policy.id, amount: policy.amount } }
              : undefined
          },
          update: {}
        });
      }
    }
    await writeAudit(tx, request, {
      action: preserveExistingPublicProfile ? "PUBLIC_APPLICATION_LINKED" : existing ? "PERSON_REGISTRATION_MERGED" : "PERSON_CREATE",
      resourceType: "Person",
      resourceId: person.id,
      before: existing ? { status: existing.status, projectId: existing.projectId } : undefined,
      after: { status: person.status, projectId: person.projectId, source: bound.source, consentConfirmed: bound.consent === true }
    });
    await createKeyNotifications(tx, config, {
      personId: person.id,
      supplierId: bound.supplierId,
      recommenderUserId: bound.recommenderUserId,
      type: "APPLICATION_CREATED",
      title: "报名已受理",
      content: `${person.name}的报名已进入系统`,
      targetPath: `/pages/operator/person-detail/index?id=${person.id}`,
      dedupeKey: `APPLICATION_CREATED:${application?.id ?? person.id}`
    });
    return { person, application, deduplicated: Boolean(existing) };
  });
  return result;
}
