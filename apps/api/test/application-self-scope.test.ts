import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { UserRole } from "@xiangneng/shared";
import { buildTestApp, createPrismaMock, login, passwordHash, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("个人报名身份隔离", () => {
  it.each([UserRole.EMPLOYEE, UserRole.OUTSOURCED_EMPLOYEE, UserRole.JOB_SEEKER])("%s 的我的报名只查询本人，不混入推荐朋友记录", async (role) => {
    const personId = "10000000-0000-4000-8000-000000000010";
    const user = userFixture({ role, personId, passwordHash: await passwordHash() });
    let observedWhere: unknown;
    const prisma = createPrismaMock({ user: { findUnique: async () => user }, application: { findMany: async (raw) => {
      observedWhere = (raw as { where: unknown }).where;
      return [];
    } } });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app);
    const response = await app.inject({ method: "GET", url: "/api/applications/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(observedWhere).toEqual({ personId });
  });
});
