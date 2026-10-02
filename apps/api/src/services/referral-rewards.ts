import { EmploymentStatus, RewardStatus } from "@xiangneng/shared";
import { AppError } from "../errors.js";

type EligibilityReferral = {
  policySnapshot: unknown;
  application: { employmentStatus: string; onboardDate: Date | null; offboardDate: Date | null };
};

export function rewardEligibility(referral: EligibilityReferral, now = new Date()) {
  const snapshot = referral.policySnapshot && typeof referral.policySnapshot === "object"
    ? referral.policySnapshot as Record<string, unknown>
    : {};
  const retentionDays = Number(snapshot.retentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    return { eligible: false, retentionDays: null, eligibleAt: null, reason: "报名规则快照缺少明确的在岗天数，请核实原始规则" };
  }
  const application = referral.application;
  if (!application.onboardDate) {
    return { eligible: false, retentionDays, eligibleAt: null, reason: "尚未确认该次报名的入职日期" };
  }
  const eligibleAt = new Date(application.onboardDate.getTime() + retentionDays * 86_400_000);
  const completedBeforeLeaving = application.employmentStatus === EmploymentStatus.LEFT
    && application.offboardDate && application.offboardDate >= eligibleAt;
  if ((!completedBeforeLeaving && application.employmentStatus !== EmploymentStatus.ACTIVE)
    || (application.offboardDate && application.offboardDate < eligibleAt)) {
    return { eligible: false, retentionDays, eligibleAt, reason: "该次报名未完成约定的在岗期限" };
  }
  return {
    eligible: now >= eligibleAt,
    retentionDays,
    eligibleAt,
    reason: now >= eligibleAt ? "已达到报名时约定的在岗期限，仍需核实其他政策条件" : `尚未达到在岗满 ${retentionDays} 天`
  };
}

export function validateRewardTransition(existing: { status: string }, nextStatus: RewardStatus): void {
  const allowed: Record<string, readonly RewardStatus[]> = {
    [RewardStatus.PENDING]: [RewardStatus.ACHIEVED, RewardStatus.CANCELLED],
    [RewardStatus.ACHIEVED]: [RewardStatus.APPROVED, RewardStatus.CANCELLED],
    [RewardStatus.APPROVED]: [RewardStatus.PAID, RewardStatus.CANCELLED],
    [RewardStatus.PAID]: [],
    [RewardStatus.CANCELLED]: []
  };
  if (!allowed[existing.status]?.includes(nextStatus)) {
    throw new AppError(409, "INVALID_REWARD_TRANSITION", "奖励状态不能跳级、回退或重复操作；已发放、已取消记录不可修改");
  }
}
