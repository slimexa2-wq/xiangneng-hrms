import Taro from "@tarojs/taro";
import { Button, Text } from "@tarojs/components";
import { useMemo, useState } from "react";
import { allJobs, allPublicJobs } from "../api/services";
import type { SessionUser } from "../api/types";
import { matchesRecruitmentFilters, recruitmentCategories, recruitmentCities } from "../domain/recruitment";
import { useAsyncData } from "../hooks/useAsyncData";
import { isEmployeeRole } from "../domain/roles";
import { CandidateNavigation, RecruitmentFilters, RecruitmentJobCard } from "./recruitment";
import { AccessDenied, AsyncBoundary, PageShell, StatePanel } from "./ui";

export function RecruitmentHome({ user }: { user: SessionUser | null }) {
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState<string>(recruitmentCities[0] ?? "全部城市");
  const [category, setCategory] = useState<string>(recruitmentCategories[0] ?? "全部工种");
  const jobs = useAsyncData(() => user ? allJobs({ status: "RECRUITING" }) : allPublicJobs(), [Boolean(user)]);
  const filtered = useMemo(() => (jobs.data?.items ?? []).filter((job) => matchesRecruitmentFilters(job, city, category, keyword)), [jobs.data, city, category, keyword]);
  const employee = isEmployeeRole(user?.role);

  Taro.useDidShow(() => { void Taro.setNavigationBarTitle({ title: "好工到 · 四川招聘" }); });
  Taro.usePullDownRefresh(() => { void jobs.reload().finally(() => Taro.stopPullDownRefresh()); });
  if (user && !user.permissions.includes("job:read")) return <AccessDenied />;

  return (
    <PageShell title="找工作" className="recruitment-shell">
      <RecruitmentFilters keyword={keyword} city={city} category={category} onKeyword={setKeyword} onCity={setCity} onCategory={setCategory} />
      <AsyncBoundary loading={jobs.loading} error={jobs.error} onRetry={() => void jobs.reload()}>
        {filtered.length ? filtered.map((job) => <RecruitmentJobCard key={job.id} job={job} actionLabel={employee ? "推荐报名" : "立即报名"} canApply={!user || user.permissions.includes("application:create") || user.permissions.includes("referral:create")} />) : <StatePanel title="暂时没有符合条件的岗位" description="可以换个城市或工种，再看看其他工作。" actionText="查看全部岗位" onAction={() => { setCity("全部城市"); setCategory("全部工种"); setKeyword(""); }} />}
      </AsyncBoundary>
      {!user ? <Button className="button button--secondary" onClick={() => void Taro.navigateTo({ url: "/pages/login/index" })}>登录查看本人报名进度</Button> : null}
      <Text className="recruitment-service-note">报名后由岗位负责人联系。工资、吃住及入职条件以岗位公示和签约确认内容为准。</Text>
      <CandidateNavigation active="jobs" user={user} />
    </PageShell>
  );
}
