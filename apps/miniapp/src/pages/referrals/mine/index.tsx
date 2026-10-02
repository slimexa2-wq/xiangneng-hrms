import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, formatMoney, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { CandidateNavigation } from "../../../components/recruitment";
import { isEmployeeRole } from "../../../domain/roles";
import { applicationProgressStatus } from "../../../domain/recruitment";

export default function MyReferralsPage() {
  const user = useSession();
  const referrals = useAsyncData(() => isEmployeeRole(user?.role) ? api.myReferrals() : Promise.resolve([]), [user?.id]);
  if (!user) return <PageShell title="我的推荐" />;
  if (!isEmployeeRole(user.role)) return <AccessDenied />;
  const items = referrals.data ? itemsOf(referrals.data) : [];
  return (
    <PageShell title="我的推荐" subtitle="好友的报名、面试和入职进度" className="recruitment-shell">
      <AsyncBoundary loading={referrals.loading} error={referrals.error} empty={!items.length} emptyText="暂无推荐记录" onRetry={() => void referrals.reload()}>
        {items.map((referral) => (
          <SectionCard title={referral.personName ?? referral.person?.name ?? "被推荐人"} key={referral.id} action={<StatusTag status={referral.application ? applicationProgressStatus(referral.application) : referral.status ?? referral.person?.employmentStatus ?? referral.person?.status} />}>
            <FieldRow label="手机号" value={referral.person?.phone ?? referral.maskedPhone} />
            <FieldRow label="项目" value={referral.jobDemand ? projectName(referral.jobDemand) : referral.person ? projectName(referral.person) : "综合招聘项目"} />
            <FieldRow label="岗位" value={referral.jobDemand?.title ?? referral.person?.jobTitle ?? "综合岗位"} />
            <FieldRow label="面试日期" value={formatDate(referral.application ? referral.application.interviewDate : referral.person?.interviewDate)} />
            <FieldRow label="入职日期" value={formatDate(referral.application ? referral.application.onboardDate : referral.onboardDate ?? referral.person?.onboardDate)} />
            <FieldRow label="奖励金额" value={formatMoney(referral.rewardAmount ?? referral.reward?.amount)} />
            <FieldRow label="奖励状态" value={<StatusTag status={referral.rewardStatus ?? referral.reward?.status} />} />
            {referral.eligibility?.retentionDays ? <FieldRow label="奖励在职要求" value={`入职满 ${referral.eligibility.retentionDays} 天`} /> : null}
            {referral.eligibility?.eligibleAt ? <FieldRow label="奖励满期日期" value={formatDate(referral.eligibility.eligibleAt)} /> : null}
          </SectionCard>
        ))}
      </AsyncBoundary>
      <CandidateNavigation active="applications" user={user} />
    </PageShell>
  );
}
