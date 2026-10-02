import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { CandidateNavigation } from "../../../components/recruitment";
import { jobDetailPath } from "../../../domain/links";
import { applicationProgressStatus } from "../../../domain/recruitment";

export default function MyApplicationsPage() {
  const user = useSession(false);
  const applications = useAsyncData(() => user?.role === "JOB_SEEKER" ? api.myApplications() : Promise.resolve([]), [user?.id]);
  Taro.useDidShow(() => { if (user?.role === "JOB_SEEKER") void applications.reload(); });
  if (!user) return <PageShell title="我的报名" subtitle="登录后查看本人报名和面试进度" className="recruitment-shell"><SectionCard title="报名之后，进度在这里看"><Text className="recruitment-body-text">请使用本人账号登录或绑定微信身份。报名记录只向你本人展示。</Text><View className="spacer" /><Button className="button" onClick={() => void Taro.navigateTo({ url: "/pages/login/index" })}>登录查看报名</Button></SectionCard><CandidateNavigation active="applications" /></PageShell>;
  if (user.role !== "JOB_SEEKER") return <AccessDenied message="求职者仅可查看本人报名记录。" />;
  const items = applications.data ? itemsOf(applications.data) : [];
  return (
    <PageShell title="我的报名" subtitle="查看最新报名、面试和入职进度" className="recruitment-shell">
      <AsyncBoundary loading={applications.loading} error={applications.error} empty={!items.length} emptyText="暂无报名记录" onRetry={() => void applications.reload()}>
        {items.map((application) => (
          <SectionCard title={application.jobDemand?.title ?? "岗位信息暂缺"} key={application.id} action={<StatusTag status={applicationProgressStatus(application)} />}>
            <FieldRow label="项目" value={application.jobDemand ? projectName(application.jobDemand) : application.person ? projectName(application.person) : "综合招聘项目"} />
            <FieldRow label="报名人" value={application.person?.name ?? application.personName ?? user.displayName} />
            <FieldRow label="手机号" value={application.person?.phone ?? application.phone} />
            <FieldRow label="报名日期" value={formatDate(application.appliedAt ?? application.createdAt)} />
            {(application.interviewDate === undefined ? application.person?.interviewDate : application.interviewDate) ? <FieldRow label="面试安排" value={formatDate(application.interviewDate === undefined ? application.person?.interviewDate : application.interviewDate)} /> : null}
            {(application.onboardDate === undefined ? application.person?.onboardDate : application.onboardDate) ? <FieldRow label="入职日期" value={formatDate(application.onboardDate === undefined ? application.person?.onboardDate : application.onboardDate)} /> : null}
            <Text className="muted">如状态未更新，请联系岗位详情中的项目负责人。</Text>
            {application.jobDemand?.id ? <Button className="button button--secondary" onClick={() => void Taro.navigateTo({ url: jobDetailPath(application.jobDemand!.id) })}>查看岗位与联系电话</Button> : null}
          </SectionCard>
        ))}
      </AsyncBoundary>
      <CandidateNavigation active="applications" user={user} />
    </PageShell>
  );
}
