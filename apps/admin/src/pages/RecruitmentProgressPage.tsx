import { useState } from "react";
import { EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag
} from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { TableColumnsType } from "antd";
import {
  ApplicationSource,
  EmploymentStatus,
  InterviewStatus,
  Permission,
  labels
} from "@xiangneng/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { RecruitmentModuleNav } from "../components/RecruitmentModuleNav";
import { RecruitmentWorkspace } from "../components/RecruitmentWorkspace";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { adaptApplication, adaptJobDemand, mapList } from "../lib/adapters";
import { applicationInterviewEndpoint } from "../lib/applications";
import { formatDate, formatDateTime, listResult, projectName } from "../lib/format";
import type { Application, JobDemand, ListResult } from "../types/domain";

type ApplicationResponse = ListResult<Application> & {
  summary?: {
    applicationCount: number;
    arrivedCount: number;
    passedCount: number;
    onboardCount: number;
    remainingCount: number;
  };
};

const sourceLabels: Record<ApplicationSource, string> = {
  [ApplicationSource.OPERATOR]: "运营报名",
  [ApplicationSource.SUPPLIER]: "供应商报人",
  [ApplicationSource.SELF]: "求职者报名",
  [ApplicationSource.REFERRAL]: "内部推荐"
};

type FollowUpValues = { status: InterviewStatus; interviewDate?: Dayjs; notes?: string };

function canFollowUp(application: Application): boolean {
  return application.employmentStatus !== EmploymentStatus.ACTIVE && application.employmentStatus !== EmploymentStatus.LEFT;
}

function RecruitmentProgressContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [jobDemandId, setJobDemandId] = useState<string | undefined>(searchParams.get("jobDemandId") ?? undefined);
  const [source, setSource] = useState<ApplicationSource>();
  const [keyword, setKeyword] = useState("");
  const [interviewStatus, setInterviewStatus] = useState<InterviewStatus>();
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>();
  const [detail, setDetail] = useState<Application>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string>();
  const [followingUp, setFollowingUp] = useState<Application>();
  const [followUpForm] = Form.useForm<FollowUpValues>();

  const resource = useApiResource(
    async () => mapList(await api.get<ApplicationResponse | Application[]>("/applications", { page, pageSize, jobDemandId, source, keyword, interviewStatus, employmentStatus }), adaptApplication, page, pageSize),
    [page, pageSize, jobDemandId, source, keyword, interviewStatus, employmentStatus]
  );
  const jobsResource = useApiResource(
    async () => mapList(await getAllPages<JobDemand>("/job-demands"), adaptJobDemand, 1, 200),
    []
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const jobs = jobsResource.data ? listResult(jobsResource.data, 1, 200).items : [];
  const selectedJob = jobs.find((job) => job.id === jobDemandId);
  const summary = selectedJob ? {
    applicationCount: selectedJob.applicationCount ?? 0,
    arrivedCount: selectedJob.arrivedCount ?? 0,
    passedCount: selectedJob.passedCount ?? 0,
    onboardCount: selectedJob.onboardCount ?? 0,
    remainingCount: selectedJob.remainingCount ?? 0
  } : undefined;

  const openFollowUp = (application: Application) => {
    followUpForm.resetFields();
    followUpForm.setFieldsValue({ status: application.interviewStatus ?? InterviewStatus.PENDING_ARRIVAL, interviewDate: application.interviewDate ? dayjs(application.interviewDate) : undefined });
    setFollowingUp(application);
  };

  const updateInterview = async (application: Application, values: FollowUpValues) => {
    setUpdatingId(application.id);
    try {
      const saved = await api.patch<Partial<Application>>(applicationInterviewEndpoint(application.id), { ...values, interviewDate: values.interviewDate?.toISOString() ?? null });
      message.success("面试跟进已保存，人员档案同步更新");
      setFollowingUp(undefined);
      if (detail?.id === application.id) setDetail(adaptApplication({ ...application, ...saved }));
      await Promise.all([resource.reload(), jobsResource.reload()]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setUpdatingId(undefined);
    }
  };

  const columns: TableColumnsType<Application> = [
    { title: "报名人", fixed: "left", width: 175, render: (_, row) => <div className="recruitment-cell"><strong className="recruitment-job-title">{row.person?.name ?? "—"}</strong><span>{row.person?.phone ?? "—"}</span><span className="recruitment-cell-muted">{formatDateTime(row.createdAt)}</span></div> },
    { title: "应聘岗位", width: 250, render: (_, row) => <div className="recruitment-cell"><strong>{row.jobDemand?.title ?? "—"}</strong><span className="recruitment-cell-muted">{row.jobDemand ? projectName(row.jobDemand) : row.person ? projectName(row.person) : "—"}</span>{row.jobDemand?.salary ? <span className="recruitment-salary">{row.jobDemand.salary}</span> : null}</div> },
    { title: "报名来源", dataIndex: "source", width: 120, render: (value: ApplicationSource) => <Tag color="blue">{sourceLabels[value]}</Tag> },
    { title: "供应商", width: 150, render: (_, row) => row.supplier?.name || "—" },
    { title: "推荐人", width: 120, render: (_, row) => row.recommender?.displayName || "—" },
    { title: "面试日期", width: 110, render: (_, row) => formatDate(row.interviewDate) },
    {
      title: "面试状态",
      width: 130,
      render: (_, row) => <StatusTag status={row.interviewStatus} />
    },
    { title: "报名状态", width: 110, render: (_, row) => <StatusTag status={row.employmentStatus} /> },
    {
      title: "操作",
      fixed: "right",
      width: 235,
      render: (_, row) => <Space size={4}>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetail(row); setDetailOpen(true); }}>详情</Button>
        {can(Permission.PEOPLE_WRITE) && canFollowUp(row) ? <Button type="link" size="small" onClick={() => openFollowUp(row)}>跟进</Button> : null}
        {row.personId && can(Permission.PEOPLE_READ) ? <Button type="link" size="small" onClick={() => navigate(`/people?keyword=${encodeURIComponent(row.person?.idCard ?? row.person?.phone ?? "")}`)}>人员档案</Button> : null}
      </Space>
    }
  ];

  return (
    <RecruitmentWorkspace>
      <RecruitmentModuleNav />
      <PageHeader
        title="报名跟进"
        description="查看报名、安排面试、记录跟进。办理入职时进入人员档案。"
        extra={<Button icon={<ReloadOutlined />} onClick={() => { void resource.reload(); void jobsResource.reload(); }} loading={resource.loading}>刷新</Button>}
      />
      {summary ? (
        <Row gutter={[12, 12]} className="summary-strip">
          {[
            ["已报名", summary.applicationCount],
            ["已到场", summary.arrivedCount],
            ["面试通过", summary.passedCount],
            ["已入职", summary.onboardCount],
            ["剩余缺口", summary.remainingCount]
          ].map(([label, value]) => <Col xs={12} md={8} xl={4} key={String(label)}><Card><Statistic title={label} value={Number(value)} /></Card></Col>)}
        </Row>
      ) : null}
      <ContentCard>
        <div className="recruitment-filter-grid">
          <Input.Search allowClear placeholder="搜索姓名 / 手机号" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
          <ReferenceSelect placeholder="招聘需求" options={jobs.map((job) => ({ value: job.id, label: `${job.title} · ${projectName(job)}` }))} value={jobDemandId} onChange={(value) => { setJobDemandId(value as string | undefined); setPage(1); }} loading={jobsResource.loading} />
          <Select allowClear placeholder="报名来源" value={source} options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setSource(value); setPage(1); }} />
          <Select allowClear placeholder="全部面试状态" value={interviewStatus} options={Object.entries(labels.interviewStatus).map(([value, label]) => ({ value, label }))} onChange={(value) => { setInterviewStatus(value); setPage(1); }} />
          <Select allowClear placeholder="全部入职状态" value={employmentStatus} options={Object.entries(labels.employmentStatus).map(([value, label]) => ({ value, label }))} onChange={(value) => { setEmploymentStatus(value); setPage(1); }} />
        </div>
        {resource.error ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<Application>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1400 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条报名` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无报名记录" }}
          />
        )}
      </ContentCard>

      <Drawer title="报名详情" width={680} open={detailOpen} onClose={() => setDetailOpen(false)} extra={detail && can(Permission.PEOPLE_WRITE) && canFollowUp(detail) ? <Button type="primary" onClick={() => openFollowUp(detail)}>记录跟进</Button> : null}>
        {detail ? <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="姓名">{detail.person?.name ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="手机号">{detail.person?.phone ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="岗位">{detail.jobDemand?.title ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="项目">{detail.jobDemand ? projectName(detail.jobDemand) : "—"}</Descriptions.Item>
          <Descriptions.Item label="报名来源">{sourceLabels[detail.source]}</Descriptions.Item>
          <Descriptions.Item label="报名时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="面试日期">{formatDate(detail.interviewDate)}</Descriptions.Item>
          <Descriptions.Item label="面试状态"><StatusTag status={detail.interviewStatus} /></Descriptions.Item>
          <Descriptions.Item label="报名状态"><StatusTag status={detail.employmentStatus} /></Descriptions.Item>
          <Descriptions.Item label="报名入职日期">{formatDate(detail.onboardDate)}</Descriptions.Item>
          <Descriptions.Item label="报名离职日期">{formatDate(detail.offboardDate)}</Descriptions.Item>
          <Descriptions.Item label="离职原因">{detail.offboardReason || "—"}</Descriptions.Item>
          <Descriptions.Item label="供应商">{detail.supplier?.name || "—"}</Descriptions.Item>
          <Descriptions.Item label="推荐人">{detail.recommender?.displayName || "—"}</Descriptions.Item>
        </Descriptions> : null}
      </Drawer>
      <Modal title={`面试跟进 · ${followingUp?.person?.name ?? ""}`} open={Boolean(followingUp)} confirmLoading={Boolean(updatingId)} onCancel={() => { if (!updatingId) setFollowingUp(undefined); }} onOk={() => followUpForm.submit()} okText="保存跟进" cancelText="取消" destroyOnHidden>
        <Form<FollowUpValues> form={followUpForm} layout="vertical" onFinish={(values) => { if (followingUp) void updateInterview(followingUp, values); }}>
          <Form.Item label="应聘岗位"><Input value={followingUp?.jobDemand?.title ?? "—"} disabled /></Form.Item>
          <Form.Item name="status" label="面试状态" rules={[{ required: true, message: "请选择面试状态" }]}><Select options={Object.entries(labels.interviewStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="interviewDate" label="面试时间"><DatePicker showTime className="full-width" /></Form.Item>
          <Form.Item name="notes" label="跟进说明" extra="本次说明将同步到人员档案备注。"><Input.TextArea rows={3} maxLength={1000} showCount placeholder="联系结果、面试安排、需要协助的事项等" /></Form.Item>
        </Form>
      </Modal>
    </RecruitmentWorkspace>
  );
}

export function RecruitmentProgressPage() {
  return <PermissionGuard permission={Permission.JOB_READ}><PermissionGuard permission={Permission.PEOPLE_READ}><RecruitmentProgressContent /></PermissionGuard></PermissionGuard>;
}
