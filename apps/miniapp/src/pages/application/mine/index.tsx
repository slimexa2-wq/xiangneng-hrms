import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { CandidateNavigation } from "../../../components/recruitment";
import { jobDetailPath, loginPath } from "../../../domain/links";
import { applicationProgressStatus } from "../../../domain/recruitment";
import { isEmployeeRole } from "../../../domain/roles";

export default function MyApplicationsPage() {
  const user = useSession(false);
  const personal = user?.role === "JOB_SEEKER" || isEmployeeRole(user?.role);
  const applications = useAsyncData(() => personal ? api.myApplications() : Promise.resolve([]), [user?.id, personal]);
  Taro.useDidShow(() => { if (personal) void applications.reload(); });
  if (!user) return <PageShell title="我的报名" subtitle="登录后查看本人报名和面试进度" className="recruitment-shell"><SectionCard title="报名之后，进度在这里看"><Text className="recruitment-body-text">请使用本人账号登录。匿名报名的档案需由负责人核实后绑定账号，记录只向你本人展示。</Text><View className="spacer" /><Button className="button" onClick={() => void Taro.navigateTo({ url: loginPath("/pages/application/mine/index") })}>登录查看报名</Button></SectionCard><CandidateNavigation active="applications" /></PageShell>;
  if (!personal) return <AccessDenied message="此入口只显示求职者或员工本人的报名。运营与供应商请在自己的人员入口查看授权记录。" />;
  const items = applications.data ? itemsOf(applications.data) : [];
  return (
    <PageShell title="我的报名" subtitle="查看最新报名、面试和入职进度" className="recruitment-shell">
      <AsyncBoundary loading={applications.loading} error={applications.error} empty={!items.length} emptyText="暂无报名记录" onRetry={() => void applications.reload()}>
        {items.map((application) => (
          <SectionCard title={application.jobDemand?.title ?? "岗位信息暂缺"} key={application.id} action={<StatusTag status={applicationProgressStatus(application)} />}>
            <ApplicationSteps status={applicationProgressStatus(application)} />
            <FieldRow label="项目" value={application.jobDemand ? projectName(application.jobDemand) : application.person ? projectName(application.person) : "项目资料暂缺"} />
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

function ApplicationSteps({ status }: { status?: string }) {
  const step = status === "ACTIVE" || status === "LEFT" ? 2 : ["INTERVIEWING", "ARRIVED", "PASSED", "FAILED", "PENDING_ONBOARD"].includes(status ?? "") ? 1 : 0;
  return <View className="recruitment-application-steps">{["已报名", "面试", "入职"].map((label, index) => <View key={label} className={`recruitment-application-step ${index <= step ? "recruitment-application-step--done" : ""}`}><Text className="recruitment-application-step__dot">{index + 1}</Text><Text>{label}</Text></View>)}</View>;
}
