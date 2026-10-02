import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { allJobs, api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, MetricGrid, PageShell, SectionCard } from "../../../components/ui";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { localMonthString } from "../../../domain/format";
import { CandidateNavigation, RecruitmentJobCard } from "../../../components/recruitment";
import { isEmployeeRole } from "../../../domain/roles";

export default function ReferralHomePage() {
  const user = useSession(false);
  const canRefer = Boolean(isEmployeeRole(user?.role) && user?.permissions.includes("referral:create"));
  const jobs = useAsyncData(() => canRefer ? allJobs({ status: "RECRUITING" }) : Promise.resolve(null), [canRefer]);
  const referrals = useAsyncData(() => canRefer ? api.myReferrals() : Promise.resolve([]), [canRefer]);
  const rewards = useAsyncData(() => canRefer ? api.myRewards() : Promise.resolve([]), [canRefer]);
  if (!user || user.role === "JOB_SEEKER") return (
    <PageShell title="推荐奖励" subtitle="好友找到工作，奖励条件先看清" className="recruitment-shell">
      <View className="referral-offer"><Text className="referral-offer__eyebrow">一次直接推荐</Text><Text className="referral-offer__condition">内部员工推荐，按岗位规则领取奖励</Text><Text className="referral-offer__rule">推荐入口面向已绑定人员档案的内部员工开放。具体奖励金额、员工类型、入职满期天数和不计奖情形，在岗位详情中公示。</Text></View>
      <SectionCard title="奖励怎样发放？"><View className="referral-steps"><Text>1. 员工分享岗位，好友报名</Text><Text>2. 好友入职，满足在职期限</Text><Text>3. 财务审核，通过后安排付款</Text><Text>4. 在奖励记录中查看实际发放状态</Text></View><Text className="muted">报名不等于奖励到账。推荐资格和奖励以该岗位有效政策为准。</Text></SectionCard>
      {!user ? <Button className="button" onClick={() => void Taro.navigateTo({ url: "/pages/login/index" })}>员工登录，查看我的奖励</Button> : null}
      <Button className="button button--secondary" onClick={() => void Taro.reLaunch({ url: "/pages/jobs/index/index" })}>先看看招聘岗位</Button>
      <CandidateNavigation active="referrals" user={user} />
    </PageShell>
  );
  if (!canRefer) {
    return <AccessDenied message="内部推荐仅向已绑定人员档案的内部员工开放。" />;
  }
  const referralItems = referrals.data ? itemsOf(referrals.data) : [];
  const rewardItems = rewards.data ? itemsOf(rewards.data) : [];
  const currentMonth = localMonthString();
  const metrics = [
    { label: "本月推荐", value: referralItems.filter((item) => item.createdAt?.startsWith(currentMonth)).length, path: "/pages/referrals/mine/index" },
    { label: "已入职", value: referralItems.filter((item) => Boolean(item.application ? item.application.onboardDate : item.onboardDate ?? item.person?.onboardDate)).length, path: "/pages/referrals/mine/index" },
    {
      label: "待达成奖励",
      value: rewardItems.filter((item) => item.status === "PENDING").reduce((sum, item) => sum + Number(item.amount), 0),
      path: "/pages/referrals/rewards/index"
    },
    {
      label: "已发放奖励",
      value: rewardItems.filter((item) => item.status === "PAID").reduce((sum, item) => sum + Number(item.amount), 0),
      path: "/pages/referrals/rewards/index"
    }
  ];
  return (
    <PageShell title="推荐有奖" subtitle="直接推荐好友，达成岗位条件后审核发放" className="recruitment-shell">
      <AsyncBoundary
        loading={referrals.loading || rewards.loading}
        error={referrals.error ?? rewards.error}
        onRetry={() => {
          void referrals.reload();
          void rewards.reload();
        }}
      >
        <MetricGrid metrics={metrics} />
      </AsyncBoundary>
      <SectionCard title="我的推荐与奖励" action={<Text className="link-text" onClick={() => void Taro.navigateTo({ url: "/pages/referrals/rewards/index" })}>奖励明细 ›</Text>}><View className="referral-steps"><Text>分享岗位 → 好友报名 → 入职满期 → 审核发放</Text></View><Text className="muted">每个岗位分别显示金额、达成条件和不计奖情形。仅记录你的直接推荐。</Text></SectionCard>
      <View className="recruitment-list-heading"><Text>可推荐岗位</Text></View>
        <AsyncBoundary loading={jobs.loading} error={jobs.error} empty={!jobs.data?.items.length} emptyText="暂无可推荐岗位" onRetry={() => void jobs.reload()}>
          {(jobs.data?.items ?? []).map((job) => (
            <RecruitmentJobCard
              key={job.id}
              job={job}
              actionLabel="推荐报名"
              showReward
            />
          ))}
        </AsyncBoundary>
      <CandidateNavigation active="referrals" user={user} />
    </PageShell>
  );
}
