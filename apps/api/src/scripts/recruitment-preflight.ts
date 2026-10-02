import { PrismaClient } from "../generated/prisma/client.js";

// Read-only compatibility check. Safe to run before the recruitment migration;
// neither personal identity details nor the connection URL are printed.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the read-only recruitment preflight");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

try {
  const [duplicateReferrals, legacyRewards] = await prisma.$transaction([
    prisma.$queryRaw<Array<{ personId: string; jobDemandId: string; count: number }>>`
      SELECT person_id AS "personId", job_demand_id AS "jobDemandId", COUNT(*)::int AS count
      FROM referral_records GROUP BY person_id, job_demand_id HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<Array<{ referralId: string; rewardId: string; status: string }>>`
      SELECT r.id AS "referralId", w.id AS "rewardId", w.status::text AS status
      FROM referral_records r JOIN referral_reward_records w ON w.referral_id = r.id
      WHERE w.status::text IN ('PENDING', 'ACHIEVED')
        AND r.policy_snapshot ->> 'retentionDays' IS NULL
    `
  ]);
  const blockers = duplicateReferrals.length > 0 || legacyRewards.length > 0;
  console.log(JSON.stringify({
    readOnly: true,
    ready: !blockers,
    duplicateReferralCount: duplicateReferrals.length,
    duplicateReferrals: duplicateReferrals.slice(0, 50),
    missingSnapshotRewardCount: legacyRewards.length,
    missingSnapshotRewards: legacyRewards.slice(0, 50),
    instructions: blockers
      ? "请先人工核对重复推荐及原始报名规则；不得删除付款历史或用当前政策覆盖原始快照。此预检不修改任何数据。"
      : "未发现重复推荐或缺少满期天数的待处理奖励；仍须核对岗位奖励政策、备份数据库并在测试环境执行迁移。"
  }, null, 2));
  if (blockers) process.exitCode = 1;
} catch {
  console.error("只读招聘预检失败；请检查数据库连接及现有 HRMS 表结构。未修改任何数据。");
  process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
