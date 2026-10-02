import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useEffect, useRef } from "react";
import { api, type OverviewStatistics } from "../../api/services";
import { AsyncBoundary, ConfigGapBanner, MetricGrid, PageShell, SectionCard } from "../../components/ui";
import { menuForUser, portalForRole, roleLabels } from "../../domain/roles";
import { jobDetailPath, referralTokenFromParams } from "../../domain/links";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useSession } from "../../hooks/useSession";
import { RecruitmentHome } from "../../components/recruitment-home";

function stat(source: OverviewStatistics | null, ...keys: string[]): number | string {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number") return value;
    const cardValue = source?.cards?.[key];
    if (typeof cardValue === "number") return cardValue;
  }
  return "—";
}

export default function HomePage() {
  const user = useSession(false);
  const referralHandled = useRef(false);
  const params = Taro.getCurrentInstance().router?.params ?? {};
  const referralToken = referralTokenFromParams(params);
  const canReadStats = Boolean(user?.permissions.includes("dashboard:read"));
  const statistics = useAsyncData(
    () => (canReadStats ? api.overview() : Promise.resolve({})),
    [canReadStats]
  );

  useEffect(() => {
    if (!referralToken || referralHandled.current) return;
    referralHandled.current = true;
    void api.resolveReferralShare(referralToken)
      .then((share) => Taro.navigateTo({
        url: jobDetailPath(share.jobDemandId, referralToken)
      }))
      .catch(() => Taro.showToast({ title: "推荐链接已失效", icon: "none" }));
  }, [referralToken]);

  if (!user || user.role === "JOB_SEEKER") return <RecruitmentHome user={user} />;
  const portal = portalForRole(user.role);
  const metrics =
    portal === "operator"
      ? [
          { label: "今日面试", value: stat(statistics.data, "todayInterview"), path: "/pages/operator/interviews/index" },
          { label: "面试通过", value: stat(statistics.data, "interviewPassed"), path: "/pages/operator/interviews/index?status=PASSED" },
          { label: "当前在职", value: stat(statistics.data, "active"), path: "/pages/operator/people/index?status=ACTIVE" },
          { label: "今日入职", value: stat(statistics.data, "todayOnboard"), path: "/pages/operator/people/index?onboard=today" }
        ]
      : portal === "supplier"
        ? [
            { label: "今日面试", value: stat(statistics.data, "todayInterview"), path: "/pages/supplier/people/index" },
            { label: "面试通过", value: stat(statistics.data, "interviewPassed"), path: "/pages/supplier/people/index?interviewStatus=PASSED" },
            { label: "当前在职", value: stat(statistics.data, "active"), path: "/pages/supplier/people/index?status=ACTIVE" },
            { label: "今日入职", value: stat(statistics.data, "todayOnboard"), path: "/pages/supplier/people/index?status=ACTIVE" }
          ]
        : [];

  return (
    <PageShell title="工作台" subtitle="根据账号角色与数据权限展示可用功能">
      <View className="hero" onClick={() => void Taro.navigateTo({ url: "/pages/profile/index/index" })}>
        <Text className="hero__eyebrow">{roleLabels[user.role]}</Text>
        <Text className="hero__title">{user.displayName}</Text>
        <Text className="hero__meta">查看账号、数据范围与配置状态 ›</Text>
      </View>
      <ConfigGapBanner />
      {metrics.length ? (
        <AsyncBoundary loading={statistics.loading} error={statistics.error} onRetry={() => void statistics.reload()}>
          <MetricGrid metrics={metrics} />
        </AsyncBoundary>
      ) : null}
      <SectionCard title="常用功能">
        <View className="menu-grid">
          {menuForUser(user).map((item) => (
            <View className="menu-item" key={item.path} onClick={() => void Taro.navigateTo({ url: item.path })}>
              <Text className="menu-item__title">{item.title}</Text>
              <Text className="menu-item__description">{item.description}</Text>
            </View>
          ))}
        </View>
      </SectionCard>
    </PageShell>
  );
}
