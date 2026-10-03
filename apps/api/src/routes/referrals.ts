import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ApplicationSource,
  Permission,
  RewardStatus,
  applicationSchema,
  idSchema,
  rewardUpdateSchema
} from "@xiangneng/shared";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { registerPerson } from "../services/registration.js";
import { writeAudit } from "../audit.js";
import { createKeyNotifications } from "../notifications.js";
import { createReferralShare, resolvePublicReferralShare } from "../services/referral-share.js";
import { andWhere, applicationWhere } from "../data-scope.js";
import { rewardEligibility, validateRewardTransition } from "../services/referral-rewards.js";

const rewardQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  status: z.nativeEnum(RewardStatus).optional(),
  keyword: z.string().trim().max(100).optional()
});

export async function referralRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/referral-shares/:token", async (request) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }).parse(request.params);
    const share = await resolvePublicReferralShare(app.prisma, token);
    return success(request, { jobDemandId: share.jobDemandId, token: share.token });
  });

  app.post("/referrals/share-token", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REFERRAL_CREATE)]
  }, async (request, reply) => {
    const { jobDemandId } = z.object({ jobDemandId: idSchema }).parse(request.body);
    const user = getSession(request);
    const share = await createReferralShare(app.prisma, { jobDemandId, recommenderUserId: user.id });
    return reply.status(201).send(success(request, {
      token: share.token,
      jobDemandId: share.jobDemandId,
      expiresAt: share.expiresAt,
      path: `/pages/jobs/detail/index?id=${share.jobDemandId}&ref=${share.token}`
    }));
  });

  app.post("/referrals", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REFERRAL_CREATE)]
  }, async (request, reply) => {
    const user = getSession(request);
    const input = applicationSchema.parse({
      ...(request.body as Record<string, unknown>),
      source: ApplicationSource.REFERRAL,
      recommenderUserId: user.id
    });
    const result = await registerPerson(app.prisma, app.config, request, input, user);
    return reply.status(result.deduplicated ? 200 : 201).send(success(request, result));
  });

  app.get("/referrals/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.referralRecord.findMany({
      where: { recommenderUserId: user.id },
      include: {
        person: { select: { id: true, name: true, phone: true, status: true, interviewDate: true, onboardDate: true, project: { select: { id: true, name: true } } } },
        jobDemand: { select: { id: true, title: true } },
        reward: { include: { payment: true } },
        application: true
      },
      orderBy: { createdAt: "desc" }
    });
    return success(request, items.map((item) => ({ ...item, eligibility: rewardEligibility(item) })));
  });

  app.get("/referral-rewards/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.referralReward.findMany({
      where: { referral: { recommenderUserId: user.id } },
      include: { referral: { include: { application: true, person: { select: { id: true, name: true } }, jobDemand: { select: { id: true, title: true } } } }, policy: { select: { id: true, name: true, version: true } }, payment: true },
      orderBy: { createdAt: "desc" }
    });
    return success(request, items.map((item) => ({ ...item, eligibility: rewardEligibility(item.referral) })));
  });

  app.get("/referral-rewards", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REWARD_READ)]
  }, async (request) => {
    const query = rewardQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere({ referral: { application: applicationWhere(user) } }, {
      status: query.status,
      ...(query.keyword ? { OR: [
        { referral: { person: { name: { contains: query.keyword, mode: "insensitive" as const } } } },
        { referral: { person: { phone: { contains: query.keyword } } } },
        { referral: { recommender: { displayName: { contains: query.keyword, mode: "insensitive" as const } } } },
        { referral: { jobDemand: { title: { contains: query.keyword, mode: "insensitive" as const } } } }
      ] } : {})
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.referralReward.findMany({
        where,
        include: {
          referral: {
            include: {
              person: { select: { id: true, name: true, phone: true, status: true, onboardDate: true } },
              application: true,
              recommender: { select: { id: true, displayName: true } },
              jobDemand: { select: { id: true, title: true, project: { select: { id: true, name: true } } } }
            }
          },
          policy: true,
          payment: true
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.referralReward.count({ where })
    ]);
    return success(request, { items: items.map((item) => ({ ...item, eligibility: rewardEligibility(item.referral) })), pagination: paginationMeta(page, pageSize, total) });
  });

  app.patch("/referral-rewards/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REWARD_READ)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = rewardUpdateSchema.parse(request.body);
    const user = getSession(request);
    const permission = input.status === RewardStatus.APPROVED
      ? Permission.REWARD_APPROVE
      : input.status === RewardStatus.PAID ? Permission.REWARD_PAY : Permission.REWARD_REVIEW;
    const canCancel = input.status === RewardStatus.CANCELLED
      && (user.permissions.includes(Permission.REWARD_REVIEW) || user.permissions.includes(Permission.REWARD_APPROVE));
    if (!canCancel && !user.permissions.includes(permission)) {
      throw new AppError(403, "FORBIDDEN", "当前账号没有此奖励操作权限");
    }
    if (input.status !== RewardStatus.PAID && !input.notes?.trim()) {
      throw new AppError(400, "REWARD_REVIEW_NOTES_REQUIRED", "请填写条件核实、财务审核或取消原因");
    }
    if (input.status === RewardStatus.PAID && !input.payment) {
      throw new AppError(400, "PAYMENT_PROOF_REQUIRED", "请提供实际付款流水、凭证和付款日期");
    }
    const reward = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.referralReward.findFirst({
        where: andWhere({ id }, { referral: { application: applicationWhere(user) } }),
        include: { referral: { include: { application: true } }, payment: true }
      });
      if (!existing) notFound("推荐奖励");
      validateRewardTransition(existing, input.status);
      if (input.status === RewardStatus.ACHIEVED || input.status === RewardStatus.APPROVED) {
        const eligibility = rewardEligibility(existing.referral);
        if (!eligibility.eligible) throw new AppError(409, "REWARD_NOT_ELIGIBLE", eligibility.reason, eligibility);
      }
      if (input.status === RewardStatus.CANCELLED && existing.status === RewardStatus.APPROVED
        && !user.permissions.includes(Permission.REWARD_APPROVE)) {
        throw new AppError(403, "FORBIDDEN", "财务已审批奖励需要财务审核权限才能取消");
      }
      const now = new Date();
      if (input.payment && input.status !== RewardStatus.PAID) throw new AppError(400, "UNEXPECTED_PAYMENT", "仅登记发放时可提交付款信息");
      if (input.payment && (input.payment.paidAt > now || input.payment.paidAt < (existing.approvedAt ?? now))) {
        throw new AppError(400, "INVALID_PAYMENT_DATE", "付款日期不能早于财务审批时间或晚于当前时间");
      }
      const updated = await tx.referralReward.updateMany({
        where: { id, status: existing.status, updatedAt: existing.updatedAt },
        data: {
          status: input.status,
          notes: input.notes,
          achievedAt: input.status === RewardStatus.ACHIEVED ? now : undefined,
          approvedAt: input.status === RewardStatus.APPROVED ? now : undefined,
          approvedById: input.status === RewardStatus.APPROVED ? user.id : undefined,
          paidAt: input.status === RewardStatus.PAID ? input.payment!.paidAt : undefined
        }
      });
      if (updated.count !== 1) throw new AppError(409, "REWARD_CONCURRENT_UPDATE", "奖励已被其他人员更新，请刷新后操作");
      if (input.status === RewardStatus.PAID) {
        await tx.referralRewardPayment.create({ data: {
          rewardId: id, amount: existing.amount, reference: input.payment!.reference,
          proof: input.payment!.proof, paidAt: input.payment!.paidAt, paidById: user.id
        } });
      }
      await writeAudit(tx, request, {
        action: "REFERRAL_REWARD_UPDATE", resourceType: "ReferralReward", resourceId: id,
        before: { status: existing.status },
        after: { status: input.status, notes: input.notes, paymentReference: input.payment?.reference }
      });
      await createKeyNotifications(tx, app.config, {
        personId: existing.referral.personId, recommenderUserId: existing.referral.recommenderUserId,
        type: input.status === RewardStatus.PAID ? "REFERRAL_REWARD_PAID" : "REFERRAL_REWARD_CHANGED",
        title: input.status === RewardStatus.PAID ? "推荐奖励已发放" : "推荐奖励状态更新",
        content: input.status === RewardStatus.PAID ? "推荐奖励已登记实际付款，可查看付款记录" : `推荐奖励状态已更新为 ${input.status}`,
        targetPath: "/pages/referrals/rewards/index", dedupeKey: `REFERRAL_REWARD:${id}:${input.status}`
      });
      return tx.referralReward.findUnique({ where: { id }, include: { payment: true } });
    });
    return success(request, reward);
  });
}
