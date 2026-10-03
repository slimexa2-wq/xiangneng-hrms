import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import {
  Permission,
  NotificationStatus,
  UserRole,
  idSchema
} from "@xiangneng/shared";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";
import { createReferralShare } from "../services/referral-share.js";
import { sessionUserInclude, toSessionUser } from "../session-user.js";

const wxCodeSchema = z.object({ code: z.string().trim().min(1).max(256) });
const wechatLoginRateLimit = {
  max: 10, timeWindow: "1 minute",
  errorResponseBuilder: () => new AppError(429, "RATE_LIMITED", "登录尝试过于频繁，请稍后再试")
};

type WechatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

async function exchangeWechatCode(app: FastifyInstance, code: string): Promise<{ openId: string; unionId?: string }> {
  if (!app.config.WECHAT_MINIAPP_APP_ID || !app.config.WECHAT_MINIAPP_APP_SECRET) {
    throw new AppError(501, "WECHAT_NOT_CONFIGURED", "微信小程序登录未配置，业务 API 仍可正常使用");
  }
  const query = new URLSearchParams({
    appid: app.config.WECHAT_MINIAPP_APP_ID,
    secret: app.config.WECHAT_MINIAPP_APP_SECRET,
    js_code: code,
    grant_type: "authorization_code"
  });
  let response: Response;
  try {
    response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new AppError(502, "WECHAT_UPSTREAM_UNAVAILABLE", "微信登录服务暂时不可用");
  }
  let payload: WechatSessionResponse;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid WeChat response");
    payload = parsed as WechatSessionResponse;
  } catch {
    throw new AppError(502, "WECHAT_AUTH_FAILED", "微信登录凭证校验失败");
  }
  if (!response.ok || payload.errcode || typeof payload.openid !== "string" || !payload.openid.trim() || payload.openid.length > 128) {
    throw new AppError(502, "WECHAT_AUTH_FAILED", "微信登录凭证校验失败");
  }
  // session_key 仅在微信服务端响应内存在：不返回前端、不入库、不写日志。
  return { openId: payload.openid, unionId: typeof payload.unionid === "string" && payload.unionid.length <= 128 ? payload.unionid : undefined };
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const loginWithWechat = async (request: FastifyRequest) => {
    const input = wxCodeSchema.parse(request.body);
    const identity = await exchangeWechatCode(app, input.code);
    const user = await app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"wechat-login:" + identity.openId}))`;
      const existing = await tx.user.findUnique({ where: { wechatMiniappOpenId: identity.openId }, include: sessionUserInclude });
      if (existing && !existing.isActive) throw new AppError(401, "ACCOUNT_DISABLED", "该账号已停用，请联系服务人员核实");
      const account = existing ?? await tx.user.upsert({
        where: { wechatMiniappOpenId: identity.openId }, update: {},
        create: {
          username: `wx_${randomBytes(20).toString("hex")}`,
          passwordHash: await hash(randomBytes(32).toString("hex"), 12),
          displayName: "微信求职者", role: UserRole.JOB_SEEKER,
          branchId: null, supplierId: null, personId: null,
          wechatMiniappOpenId: identity.openId, wechatUnionId: identity.unionId
        },
        include: sessionUserInclude
      });
      // Concurrent first logins may return an account created or disabled by
      // another transaction. Never reactivate it or change an existing role.
      if (!account.isActive) throw new AppError(401, "ACCOUNT_DISABLED", "该账号已停用，请联系服务人员核实");
      request.sessionUser = toSessionUser(account);
      await writeAudit(tx, request, { action: "AUTH_WECHAT_LOGIN_SUCCEEDED", resourceType: "User", resourceId: account.id,
        after: { firstLogin: !existing, role: account.role } });
      return account;
    });
    const sessionUser = toSessionUser(user);
    const token = app.jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    return success(request, { token, user: sessionUser });
  };
  app.post("/wechat/auth/login", { config: { rateLimit: wechatLoginRateLimit } }, loginWithWechat);
  app.post("/wechat/auth", { config: { rateLimit: wechatLoginRateLimit } }, loginWithWechat);

  app.post("/wechat/bind", { preHandler: [app.authenticate] }, async (request) => {
    const input = wxCodeSchema.parse(request.body);
    const identity = await exchangeWechatCode(app, input.code);
    const user = getSession(request);
    await app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"wechat-login:" + identity.openId}))`;
      const current = await tx.user.findUnique({ where: { id: user.id }, include: sessionUserInclude });
      if (!current?.isActive || current.tokenVersion !== request.user.tokenVersion) {
        throw new AppError(401, "UNAUTHORIZED", "账号登录状态已变化，请重新登录");
      }
      request.sessionUser = toSessionUser(current);
      const owner = await tx.user.findUnique({ where: { wechatMiniappOpenId: identity.openId }, include: {
        projectLinks: true, roleAssignments: true, dataScopeBindings: true, internalEmployee: { select: { id: true } }
      } });
      let transferredTemporaryAccount = false;
      if (owner && owner.id !== user.id) {
        const temporary = owner.isActive && owner.role === UserRole.JOB_SEEKER && /^wx_[a-f0-9]{40}$/.test(owner.username)
          && !owner.personId && !owner.branchId && !owner.supplierId && !owner.internalEmployee
          && !owner.projectLinks.length && !owner.roleAssignments.length && !owner.dataScopeBindings.length;
        if (!temporary) throw new AppError(409, "WECHAT_ALREADY_BOUND", "该微信已绑定其他人员账号，请联系服务人员核实；现有绑定未变更");
        const released = await tx.user.updateMany({ where: {
          id: owner.id, role: UserRole.JOB_SEEKER, personId: null, branchId: null, supplierId: null, isActive: true,
          wechatMiniappOpenId: identity.openId, tokenVersion: owner.tokenVersion,
          projectLinks: { none: {} }, roleAssignments: { none: {} }, dataScopeBindings: { none: {} }, internalEmployee: { is: null }
        }, data: { wechatMiniappOpenId: null, wechatUnionId: null, isActive: false, tokenVersion: { increment: 1 } } });
        if (released.count !== 1) throw new AppError(409, "WECHAT_BINDING_CONFLICT", "微信绑定状态已变化，请刷新后重试");
        transferredTemporaryAccount = true;
        await writeAudit(tx, request, { action: "WECHAT_TEMPORARY_ACCOUNT_RELEASED", resourceType: "User", resourceId: owner.id,
          after: { isActive: false, reason: "LINKED_TO_AUTHENTICATED_HRMS_ACCOUNT" } });
      }
      await tx.user.update({ where: { id: user.id }, data: { wechatMiniappOpenId: identity.openId, wechatUnionId: identity.unionId } });
      await writeAudit(tx, request, { action: "WECHAT_MINIAPP_BIND", resourceType: "User", resourceId: user.id,
        after: { bound: true, unionIdPresent: Boolean(identity.unionId), transferredTemporaryAccount } });
    });
    return success(request, { bound: true });
  });

  app.post("/wechat/referral-qrcode", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REFERRAL_CREATE)]
  }, async (request, reply) => {
    const { jobDemandId } = z.object({ jobDemandId: idSchema }).parse(request.body);
    if (!app.config.WECHAT_MINIAPP_APP_ID || !app.config.WECHAT_MINIAPP_APP_SECRET) {
      throw new AppError(501, "WECHAT_NOT_CONFIGURED", "微信小程序二维码能力未配置");
    }
    const user = getSession(request);
    const share = await createReferralShare(app.prisma, { jobDemandId, recommenderUserId: user.id });
    const tokenQuery = new URLSearchParams({
      grant_type: "client_credential",
      appid: app.config.WECHAT_MINIAPP_APP_ID,
      secret: app.config.WECHAT_MINIAPP_APP_SECRET
    });
    const tokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${tokenQuery.toString()}`);
    const tokenPayload = await tokenResponse.json() as { access_token?: string; errcode?: number; errmsg?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new AppError(502, "WECHAT_ACCESS_TOKEN_FAILED", "微信 access_token 获取失败", { errcode: tokenPayload.errcode, errmsg: tokenPayload.errmsg });
    }
    const codeResponse = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(tokenPayload.access_token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene: `r=${share.token}`,
        page: app.config.WECHAT_MINIAPP_PATH.replace(/^\//, ""),
        check_path: true,
        env_version: "release",
        width: 430
      })
    });
    const contentType = codeResponse.headers.get("content-type") ?? "";
    if (!codeResponse.ok || contentType.includes("application/json")) {
      const failure = await codeResponse.json().catch(() => ({})) as { errcode?: number; errmsg?: string };
      throw new AppError(502, "WECHAT_QRCODE_FAILED", "微信推荐二维码生成失败", failure);
    }
    const image = Buffer.from(await codeResponse.arrayBuffer());
    return reply.type("image/png").header("x-referral-token", share.token).send(image);
  });

  app.get("/notifications/config-status", { preHandler: [app.authenticate] }, async (request) => {
    return success(request, {
      miniappLoginConfigured: Boolean(app.config.WECHAT_MINIAPP_APP_ID && app.config.WECHAT_MINIAPP_APP_SECRET),
      officialAccountConfigured: Boolean(app.config.WECHAT_OFFICIAL_APP_ID && app.config.WECHAT_OFFICIAL_APP_SECRET),
      salaryTemplateConfigured: Boolean(app.config.WECHAT_TEMPLATE_SALARY_PUBLISHED),
      jobDemandTemplateConfigured: Boolean(app.config.WECHAT_TEMPLATE_JOB_DEMAND),
      deliveryMode: "QUEUE_ONLY_UNTIL_REAL_TEMPLATE_MAPPING_CONFIRMED"
    });
  });

  app.get("/notifications", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const query = z.object({
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      status: z.nativeEnum(NotificationStatus).optional(),
      all: z.enum(["true", "false"]).optional()
    }).parse(request.query);
    const canReadAll = user.permissions.includes(Permission.AUDIT_READ) && query.all === "true";
    const where = { recipientUserId: canReadAll ? undefined : user.id, status: query.status };
    const { page, pageSize, skip } = parsePagination(query);
    const [items, total] = await app.prisma.$transaction([
      app.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      app.prisma.notification.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.post("/notifications/:id/retry", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    if (!user.permissions.includes(Permission.AUDIT_READ)) {
      throw new AppError(403, "FORBIDDEN", "只有审计管理角色可以重试通知");
    }
    const notification = await app.prisma.notification.findUnique({ where: { id } });
    if (!notification) notFound("通知");
    const configured = Boolean(app.config.WECHAT_OFFICIAL_APP_ID && app.config.WECHAT_OFFICIAL_APP_SECRET);
    if (!configured) {
      const updated = await app.prisma.notification.update({
        where: { id },
        data: {
          status: NotificationStatus.SKIPPED_NOT_CONFIGURED,
          lastError: "微信公众号配置未完成，未尝试外发",
          attempts: { increment: 1 }
        }
      });
      return success(request, { notification: updated, sent: false, reason: "WECHAT_NOT_CONFIGURED" });
    }
    const updated = await app.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.PENDING,
        lastError: "真实模板字段映射与服务号用户 OpenID 尚未确认，保留队列而不伪报发送成功",
        attempts: { increment: 1 }
      }
    });
    return success(request, { notification: updated, sent: false, reason: "TEMPLATE_MAPPING_REQUIRED" });
  });
}
