import { useState } from "react";
import { EditOutlined, EyeOutlined, PlusOutlined, SendOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { TableColumnsType } from "antd";
import { JobStatus, Permission, PolicyType, labels } from "@xiangneng/shared";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { RecruitmentModuleNav } from "../components/RecruitmentModuleNav";
import { RecruitmentWorkspace } from "../components/RecruitmentWorkspace";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { StatusTag } from "../components/StatusTag";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { adaptJobDemand, mapList } from "../lib/adapters";
import { branchName, displayText, formatDate, formatMoney, listResult, projectName } from "../lib/format";
import type { JobDemand, ListResult, Policy, Project } from "../types/domain";

const cities = ["成都", "宜宾", "绵阳", "德阳", "泸州", "乐山", "南充", "眉山", "自贡", "内江", "遂宁", "广元", "广安", "达州", "巴中", "雅安", "资阳", "攀枝花", "阿坝", "甘孜", "凉山"];

function BlueCollarFields() {
  return <>
    <Form.Item name="city" label="工作城市"><Select showSearch allowClear options={cities.map((value) => ({ value, label: value }))} placeholder="选择四川省内城市" /></Form.Item>
    <Form.Item name="category" label="岗位类别"><Select allowClear options={["生产制造", "仓储物流", "餐饮服务", "建筑安装", "其他"].map((value) => ({ value, label: value }))} placeholder="选择岗位类别" /></Form.Item>
    <Form.Item name="benefits" label="实际提供的福利" className="recruitment-full-row" extra="只勾选已经确认的福利，也可输入补充内容。"><Select mode="tags" options={["包吃", "包住", "餐补", "房补", "五险", "五险一金", "免费班车", "带薪年假"].map((value) => ({ value, label: value }))} placeholder="选择或输入实际福利" maxCount={20} /></Form.Item>
  </>;
}

type JobDemandValues = {
  projectId: string;
  title: string;
  requiredCount: number;
  requirements: string;
  workContent?: string;
  salary: string;
  workTime: string;
  workLocation: string;
  city?: string;
  category?: string;
  benefits?: string[];
  deadline: Dayjs;
  status: JobStatus;
  supplierPolicyId?: string;
  referralPolicyId?: string;
  notes?: string;
};

function demandToForm(demand: JobDemand): JobDemandValues {
  return {
    projectId: demand.projectId,
    title: demand.title,
    requiredCount: demand.requiredCount,
    requirements: demand.requirements,
    workContent: demand.workContent ?? undefined,
    salary: demand.salary,
    workTime: demand.workTime,
    workLocation: demand.workLocation,
    city: demand.city ?? undefined,
    category: demand.category ?? undefined,
    benefits: demand.benefits ?? [],
    deadline: dayjs(demand.deadline),
    status: demand.status,
    supplierPolicyId: demand.supplierPolicyId ?? undefined,
    referralPolicyId: demand.referralPolicyId ?? undefined,
    notes: demand.notes ?? undefined
  };
}

function JobDemandsContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<JobStatus>();
  const [formOpen, setFormOpen] = useState(false);
  const [createForm] = Form.useForm<JobDemandValues>();
  const [detailForm] = Form.useForm<JobDemandValues>();
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<JobDemand>();
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedCreateProjectId = Form.useWatch("projectId", createForm);
  const selectedDetailProjectId = Form.useWatch("projectId", detailForm);
  const selectedCreateReferralId = Form.useWatch("referralPolicyId", createForm);
  const selectedDetailReferralId = Form.useWatch("referralPolicyId", detailForm);

  const resource = useApiResource(
    async () => mapList(await api.get<ListResult<JobDemand> | JobDemand[]>("/job-demands", { page, pageSize, keyword, projectId, status }), adaptJobDemand, page, pageSize),
    [page, pageSize, keyword, projectId, status]
  );
  const projectsResource = useApiResource(
    () => getAllPages<Project>("/projects"),
    []
  );
  const policiesResource = useApiResource(
    () => getAllPages<Policy>("/policies"),
    []
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const projects = projectsResource.data ? listResult(projectsResource.data, 1, 200).items : [];
  const policies = policiesResource.data ? listResult(policiesResource.data, 1, 200).items : [];
  const projectOptions = projects.map((item) => ({ value: item.id, label: item.name, searchText: `${item.name} ${branchName(item)}` }));
  const selectedCreateProject = projects.find((item) => item.id === selectedCreateProjectId);
  const selectedCreateReferral = policies.find((item) => item.id === selectedCreateReferralId);
  const selectedDetailReferral = policies.find((item) => item.id === selectedDetailReferralId);
  const policyOptions = (policyType: PolicyType, forProjectId?: string) => policies
    .filter((item) => item.type === policyType && (!forProjectId || item.projectId === forProjectId))
    .map((item) => ({ value: item.id, label: `${item.name}（${Number(item.amount).toLocaleString("zh-CN")} 元）`, disabled: (item.isActive ?? item.active) === false || dayjs(item.effectiveAt).isAfter(dayjs()) || Boolean(item.expiresAt && dayjs(item.expiresAt).isBefore(dayjs())) }));

  const referralContext = (policy?: Policy) => policy ? <Alert type="success" showIcon className="form-context-alert" title={`推荐奖励 ${formatMoney(policy.amount)} · 入职满 ${policy.retentionDays ?? 30} 天`} description={<><div>达成条件：{policy.achievementConditions}</div><div>不发放条件：{policy.exclusionConditions || "未设置"}</div><div>按报名时的规则版本核实，经过财务审批后发放。</div></>} /> : null;
  const demandBody = (values: JobDemandValues) => ({ ...values, deadline: values.deadline.toISOString(), city: values.city ?? null, category: values.category ?? null, benefits: values.benefits ?? [], supplierPolicyId: values.supplierPolicyId ?? null, referralPolicyId: values.referralPolicyId ?? null });

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ status: JobStatus.RECRUITING, requiredCount: 1, benefits: [] });
    setFormOpen(true);
  };

  const saveDemand = async (values: JobDemandValues) => {
    setSaving(true);
    try {
      const body = demandBody(values);
      await api.post("/job-demands", body);
      message.success("招聘需求已发布并同步");
      setFormOpen(false);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (demand: JobDemand) => {
    setDetail(demand);
    detailForm.setFieldsValue(demandToForm(demand));
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const next = adaptJobDemand(await api.get<JobDemand>(`/job-demands/${demand.id}`));
      setDetail(next);
      detailForm.setFieldsValue(demandToForm(next));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveDemandDetail = async (values: JobDemandValues) => {
    if (!detail) return;
    setSaving(true);
    try {
      const next = adaptJobDemand(await api.patch<JobDemand>(`/job-demands/${detail.id}`, demandBody(values)));
      setDetail(next);
      detailForm.setFieldsValue(demandToForm(next));
      message.success("招聘需求已保存，并同步到各角色小程序");
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (demand: JobDemand) => {
    const nextStatus = demand.status === JobStatus.RECRUITING ? JobStatus.PAUSED : JobStatus.RECRUITING;
    if (nextStatus === JobStatus.RECRUITING && !dayjs(demand.deadline).isAfter(dayjs())) {
      message.warning("请先编辑岗位，更新报名截止时间后再上架");
      void openDetail(demand);
      return;
    }
    setChangingStatusId(demand.id);
    try {
      await api.patch(`/job-demands/${demand.id}`, { status: nextStatus });
      message.success(nextStatus === JobStatus.RECRUITING ? "岗位已重新上架" : "岗位已下架，停止接收新报名");
      await resource.reload();
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setChangingStatusId(undefined); }
  };

  const columns: TableColumnsType<JobDemand> = [
    { title: "岗位与工资", fixed: "left", width: 260, render: (_, row) => <div className="recruitment-cell"><strong className="recruitment-job-title">{row.title}</strong><span className="recruitment-salary">{row.salary}</span><span className="recruitment-cell-muted">{projectName(row)}{row.category ? ` · ${row.category}` : ""}</span>{row.benefits?.length ? <span className="recruitment-cell-muted">{row.benefits.slice(0, 3).join(" · ")}{row.benefits.length > 3 ? ` 等 ${row.benefits.length} 项` : ""}</span> : null}</div> },
    { title: "地点与班次", width: 185, render: (_, row) => <div className="recruitment-cell"><span>{row.city ? `${row.city} · ` : ""}{row.workLocation}</span><span className="recruitment-cell-muted">{row.workTime}</span></div> },
    { title: "招聘进度", width: 180, render: (_, row) => <div className="recruitment-cell"><span>已入职 <strong>{row.onboardCount ?? 0}</strong> / {row.requiredCount} 人</span><Progress percent={Math.min(100, Math.round((row.onboardCount ?? 0) / row.requiredCount * 100))} strokeColor="#8e8e93" size="small" showInfo={false} /><span className="recruitment-cell-muted">报名 {row.applicationCount ?? 0} · 通过 {row.passedCount ?? 0}</span><span className="recruitment-cell-muted">还缺 {row.remainingCount ?? Math.max(0, row.requiredCount - (row.onboardCount ?? 0))} 人</span></div> },
    { title: "发布状态", width: 150, render: (_, row) => <div className="recruitment-cell"><StatusTag status={row.status} /><span className="recruitment-cell-muted">截止 {formatDate(row.deadline)}</span>{row.status === JobStatus.RECRUITING && dayjs(row.deadline).isBefore(dayjs()) ? <Tag color="orange">截止已过，请更新</Tag> : null}</div> },
    { title: "推荐奖励", width: 140, render: (_, row) => row.referralPolicy ? <div className="recruitment-cell"><strong>{formatMoney(row.referralPolicy.amount)}</strong><span className="recruitment-cell-muted">入职满 {row.referralPolicy.retentionDays ?? 30} 天</span></div> : <span className="recruitment-cell-muted">未绑定规则</span> },
    {
      title: "操作",
      fixed: "right",
      width: 175,
      render: (_, row) => <Space wrap size={[4, 4]}><Button type="link" size="small" icon={can(Permission.JOB_WRITE) ? <EditOutlined /> : <EyeOutlined />} onClick={() => void openDetail(row)}>{can(Permission.JOB_WRITE) ? "编辑" : "查看"}</Button>{can(Permission.PEOPLE_READ) ? <Button type="link" size="small" onClick={() => navigate(`/recruitment/progress?jobDemandId=${row.id}`)}>看报名</Button> : null}{can(Permission.JOB_WRITE) ? <Popconfirm title={row.status === JobStatus.RECRUITING ? "下架这个岗位？" : "重新上架这个岗位？"} description={row.status === JobStatus.RECRUITING ? "停止新报名，已有报名记录继续保留。" : "上架后可继续接收报名。"} okText="确认" cancelText="取消" onConfirm={() => changeStatus(row)}><Button type="link" size="small" loading={changingStatusId === row.id}>{row.status === JobStatus.RECRUITING ? "下架" : "上架"}</Button></Popconfirm> : null}</Space>
    }
  ];

  return (
    <RecruitmentWorkspace>
      <RecruitmentModuleNav />
      <PageHeader
        title="岗位发布"
        description="把工资、班次和实际福利说明白，方便求职者快速决定。"
        extra={can(Permission.JOB_WRITE) ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>发布新岗位</Button> : null}
      />
      <ContentCard>
        <div className="filter-grid compact">
          <Input.Search allowClear placeholder="搜索岗位名称 / 招聘要求" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
          <ReferenceSelect placeholder="项目" options={projectOptions} value={projectId} onChange={(value) => { setProjectId(value as string | undefined); setPage(1); }} loading={projectsResource.loading} />
          <Select allowClear placeholder="招聘状态" value={status} options={Object.entries(labels.jobStatus).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
        </div>
        {resource.error ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<JobDemand>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1090 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条需求` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无招聘需求" }}
          />
        )}
      </ContentCard>

      <Modal title="发布新岗位" open={formOpen} width={820} confirmLoading={saving} onCancel={() => { if (!saving) setFormOpen(false); }} onOk={() => createForm.submit()} okText="发布并同步" destroyOnHidden>
        <Form<JobDemandValues> form={createForm} layout="vertical" onFinish={(values) => void saveDemand(values)}>
          <div className="form-grid two-columns">
            <Form.Item name="projectId" label="归属项目" rules={[{ required: true, message: "请选择项目" }]}><ReferenceSelect options={projectOptions} loading={projectsResource.loading} onChange={() => createForm.setFieldsValue({ supplierPolicyId: undefined, referralPolicyId: undefined })} /></Form.Item>
            <Form.Item name="title" label="招聘岗位" rules={[{ required: true, message: "请输入岗位" }]}><Input maxLength={120} /></Form.Item>
            <Form.Item name="requiredCount" label="需求人数" rules={[{ required: true, message: "请输入需求人数" }]}><InputNumber min={1} max={100000} precision={0} className="full-width" /></Form.Item>
            <Form.Item name="status" label="招聘状态" rules={[{ required: true }]}><Select options={Object.entries(labels.jobStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="salary" label="工资与计薪方式" extra="写清月薪或时薪、加班费、发薪日及必要扣费。" rules={[{ required: true, whitespace: true, message: "请输入薪资待遇" }]}><Input maxLength={500} placeholder="例如：综合 5500–6500 元/月，次月 15 日发薪" /></Form.Item>
            <Form.Item name="workTime" label="班次与工作时间" rules={[{ required: true, whitespace: true, message: "请输入工作时间" }]}><Input maxLength={500} placeholder="例如：两班倒，8:00–20:00，月休 4 天" /></Form.Item>
            <Form.Item name="workLocation" label="工作地点" rules={[{ required: true, message: "请输入工作地点" }]}><Input maxLength={500} /></Form.Item>
            <Form.Item name="deadline" label="报名截止时间" dependencies={["status"]} rules={[{ required: true, message: "请选择截止时间" }, ({ getFieldValue }) => ({ validator(_, value?: Dayjs) { return !value || getFieldValue("status") !== JobStatus.RECRUITING || value.isAfter(dayjs()) ? Promise.resolve() : Promise.reject(new Error("招聘中的岗位须设置未来的截止时间")); } })]}><DatePicker showTime className="full-width" /></Form.Item>
            <BlueCollarFields />
            <Form.Item name="supplierPolicyId" label="供应商政策"><ReferenceSelect options={policyOptions(PolicyType.SUPPLIER, selectedCreateProjectId)} loading={policiesResource.loading} /></Form.Item>
            <Form.Item name="referralPolicyId" label="内部推荐政策"><ReferenceSelect options={policyOptions(PolicyType.EMPLOYEE_REFERRAL, selectedCreateProjectId)} loading={policiesResource.loading} /></Form.Item>
          </div>
          {referralContext(selectedCreateReferral)}
          {selectedCreateProject ? (
            <Alert
              type="info"
              showIcon
              className="form-context-alert"
              title={`${branchName(selectedCreateProject)} · ${selectedCreateProject.name}`}
              description={`项目负责人：${displayText(selectedCreateProject.managerName)} / 联系方式：${displayText(selectedCreateProject.managerPhone)}。以上信息从项目档案自动读取。`}
            />
          ) : null}
          <Form.Item name="workContent" label="工作内容" rules={[{ required: true, message: "请输入工作内容" }]}><Input.TextArea rows={4} maxLength={5000} showCount placeholder="例如：设备组装、质检、包装、现场协助、按班组安排完成日常生产任务。" /></Form.Item>
          <Form.Item name="requirements" label="报名要求" rules={[{ required: true, whitespace: true, message: "请输入岗位要求" }]}><Input.TextArea rows={3} maxLength={5000} showCount placeholder="说明经验、技能、证件及岗位必要条件。" /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="招聘需求详情与编辑" width={880} open={detailOpen} loading={detailLoading} onClose={() => setDetailOpen(false)} extra={detail ? <Space>{can(Permission.JOB_WRITE) ? <Button type="primary" loading={saving} onClick={() => detailForm.submit()}>保存修改</Button> : null}<Button icon={<SendOutlined />} onClick={() => navigate(`/recruitment/progress?jobDemandId=${detail.id}`)}>报名进度</Button></Space> : null}>
        {detail ? (
          <>
            <Row gutter={[12, 12]} className="detail-stats">
              {[
                ["需求人数", detail.requiredCount],
                ["已报名", detail.applicationCount ?? 0],
                ["面试通过", detail.passedCount ?? 0],
                ["已入职", detail.onboardCount ?? 0],
                ["剩余缺口", detail.remainingCount ?? Math.max(0, detail.requiredCount - (detail.onboardCount ?? 0))]
              ].map(([label, value]) => <Col xs={12} md={8} key={String(label)}><Card><Statistic title={label} value={Number(value)} /></Card></Col>)}
            </Row>
            <Form<JobDemandValues> form={detailForm} layout="vertical" disabled={!can(Permission.JOB_WRITE)} onFinish={(values) => void saveDemandDetail(values)}>
              <div className="form-grid two-columns">
                <Form.Item name="projectId" label="归属项目" rules={[{ required: true }]}><ReferenceSelect options={projectOptions} onChange={() => detailForm.setFieldsValue({ supplierPolicyId: undefined, referralPolicyId: undefined })} /></Form.Item>
                <Form.Item name="title" label="招聘岗位" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="requiredCount" label="需求人数" rules={[{ required: true }]}><InputNumber min={1} precision={0} className="full-width" /></Form.Item>
                <Form.Item name="status" label="招聘状态" rules={[{ required: true }]}><Select options={Object.entries(labels.jobStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
                <Form.Item name="salary" label="工资与计薪方式" extra="写清计薪单位、加班费与发薪日。" rules={[{ required: true, whitespace: true }]}><Input maxLength={500} /></Form.Item>
                <Form.Item name="workTime" label="班次与工作时间" rules={[{ required: true, whitespace: true }]}><Input maxLength={500} /></Form.Item>
                <Form.Item name="workLocation" label="工作地点" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="deadline" label="报名截止时间" dependencies={["status"]} rules={[{ required: true }, ({ getFieldValue }) => ({ validator(_, value?: Dayjs) { return !value || getFieldValue("status") !== JobStatus.RECRUITING || value.isAfter(dayjs()) ? Promise.resolve() : Promise.reject(new Error("招聘中的岗位须设置未来的截止时间")); } })]}><DatePicker showTime className="full-width" /></Form.Item>
                <BlueCollarFields />
                <Form.Item name="supplierPolicyId" label="供应商政策"><ReferenceSelect options={policyOptions(PolicyType.SUPPLIER, selectedDetailProjectId)} /></Form.Item>
                <Form.Item name="referralPolicyId" label="内部推荐政策"><ReferenceSelect options={policyOptions(PolicyType.EMPLOYEE_REFERRAL, selectedDetailProjectId)} /></Form.Item>
              </div>
              {referralContext(selectedDetailReferral)}
              <Alert type="info" showIcon className="form-context-alert" title={`项目负责人：${displayText(detail.project?.managerName)} / ${displayText(detail.project?.managerPhone)}`} description={`归属分子公司：${detail.project ? branchName(detail.project) : displayText(detail.branchName)}。负责人、联系方式、项目简介及实拍图由项目档案同步，不在岗位中重复维护。`} />
              <Form.Item name="workContent" label="工作内容" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={5000} showCount /></Form.Item>
              <Form.Item name="requirements" label="岗位要求" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={5000} showCount /></Form.Item>
              <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
            </Form>
            <Typography.Title level={4} className="section-title">项目实拍图</Typography.Title>
            {detail.project?.images?.length ? (
              <Space wrap>{detail.project.images.map((image) => <AuthenticatedImage key={image.id} imageId={image.id} width={190} height={125} alt={image.remark || image.note || detail.project?.name || "项目实拍图"} />)}</Space>
            ) : <Typography.Paragraph type="secondary">项目暂未上传实拍图，可到项目档案补充。</Typography.Paragraph>}
            <Typography.Paragraph type="secondary" className="sync-note">
              项目负责人、联系方式、简介与实拍图从项目档案实时关联，项目修改后自动同步到岗位详情。
            </Typography.Paragraph>
          </>
        ) : null}
      </Drawer>
    </RecruitmentWorkspace>
  );
}

export function JobDemandsPage() {
  return <PermissionGuard permission={Permission.JOB_READ}><JobDemandsContent /></PermissionGuard>;
}
