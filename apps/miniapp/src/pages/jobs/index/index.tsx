import Taro from "@tarojs/taro";
import { Button, Input, View } from "@tarojs/components";
import { useMemo, useState } from "react";
import { allJobs, allPublicJobs } from "../../../api/services";
import { AccessDenied, AsyncBoundary, JobCard, PageShell } from "../../../components/ui";
import { isEmployeeRole, portalForRole } from "../../../domain/roles";
import { jobDetailPath } from "../../../domain/links";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { RecruitmentHome } from "../../../components/recruitment-home";
import type { SessionUser } from "../../../api/types";

export default function JobListPage() {
  const user = useSession(false);
  if (!user || user.role === "JOB_SEEKER" || isEmployeeRole(user.role)) return <RecruitmentHome user={user} />;
  return <StaffJobList user={user} />;
}

function StaffJobList({ user }: { user: SessionUser }) {
  const [keyword, setKeyword] = useState("");
  const jobs = useAsyncData(
    () => user ? allJobs({ status: "RECRUITING" }) : allPublicJobs({ status: "RECRUITING" }),
    [user.id]
  );
  const filtered = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (!term) return jobs.data?.items ?? [];
    return (jobs.data?.items ?? []).filter((job) =>
      [job.title, job.project?.name, job.projectName, job.workLocation].some((value) => value?.toLowerCase().includes(term))
    );
  }, [jobs.data, keyword]);
  Taro.usePullDownRefresh(() => { void jobs.reload().finally(() => Taro.stopPullDownRefresh()); });

  if (user && !user.permissions.includes("job:read")) return <AccessDenied />;
  const portal = user ? portalForRole(user.role) : "job-seeker";
  const actionLabel = !user ? "查看并报名" : portal === "supplier" ? "查看并报人" : portal === "employee" ? "查看并推荐" : "查看并报名";

  return (
    <PageShell title="招聘岗位" subtitle="岗位只展示后台已发布的真实需求，项目资料自动关联">
      <View className="toolbar">
        <Input className="form-control" value={keyword} placeholder="搜索岗位、项目或地点" onInput={(event) => setKeyword(event.detail.value)} />
      </View>
      <AsyncBoundary loading={jobs.loading} error={jobs.error} empty={!filtered.length} emptyText="暂无开放岗位" onRetry={() => void jobs.reload()}>
        {filtered.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            actionLabel={actionLabel}
            onClick={() => void Taro.navigateTo({ url: jobDetailPath(job.id) })}
          />
        ))}
      </AsyncBoundary>
      <Button className="button button--secondary" onClick={() => void Taro.reLaunch({ url: "/pages/index/index" })}>返回工作台</Button>
    </PageShell>
  );
}
