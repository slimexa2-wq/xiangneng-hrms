import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, formatMoney } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { Text } from "@tarojs/components";
import { CandidateNavigation } from "../../../components/recruitment";
import { isEmployeeRole } from "../../../domain/roles";

export default function ReferralRewardsPage() {
  const user = useSession();
  const rewards = useAsyncData(() => isEmployeeRole(user?.role) ? api.myRewards() : Promise.resolve([]), [user?.id]);
  if (!user) return <PageShell title="推荐奖励" />;
  if (!isEmployeeRole(user.role)) return <AccessDenied />;
  const items = rewards.data ? itemsOf(rewards.data) : [];
  return (
    <PageShell title="我的奖励" subtitle="按报名时的规则核对，审核后安排发放" className="recruitment-shell">
      <AsyncBoundary loading={rewards.loading} error={rewards.error} empty={!items.length} emptyText="暂无奖励记录" onRetry={() => void rewards.reload()}>
        {items.map((reward) => (
          <SectionCard title={reward.referral?.personName ?? reward.referral?.person?.name ?? "推荐奖励"} key={reward.id} action={<StatusTag status={reward.status} />}>
            <FieldRow label="奖励金额" value={formatMoney(reward.amount)} />
            {reward.referral?.jobDemand?.title ? <FieldRow label="推荐岗位" value={reward.referral.jobDemand.title} /> : null}
            {reward.eligibility?.retentionDays ? <FieldRow label="在职要求" value={`入职满 ${reward.eligibility.retentionDays} 天`} /> : null}
            {reward.eligibility?.eligibleAt ? <FieldRow label="满期日期" value={formatDate(reward.eligibility.eligibleAt)} /> : null}
            {reward.referral?.policySnapshot?.achievementConditions ? <FieldRow label="达成条件" value={reward.referral.policySnapshot.achievementConditions} /> : null}
            {reward.referral?.policySnapshot?.exclusionConditions ? <FieldRow label="不计奖情形" value={reward.referral.policySnapshot.exclusionConditions} /> : null}
            <FieldRow label="达成日期" value={formatDate(reward.achievedAt)} />
            <FieldRow label="发放日期" value={formatDate(reward.paidAt)} />
            {reward.eligibility && reward.status === "PENDING" ? <Text className="muted">{reward.eligibility.reason}</Text> : null}
          </SectionCard>
        ))}
      </AsyncBoundary>
      <CandidateNavigation active="referrals" user={user} />
    </PageShell>
  );
}
