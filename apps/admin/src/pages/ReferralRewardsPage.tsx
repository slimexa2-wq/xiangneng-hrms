import { useState } from "react";
import { CheckCircleOutlined, DollarOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { TableColumnsType } from "antd";
import { Permission, RewardStatus } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { RecruitmentModuleNav } from "../components/RecruitmentModuleNav";
import { RecruitmentWorkspace } from "../components/RecruitmentWorkspace";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage } from "../lib/api";
import { adaptReward, mapList } from "../lib/adapters";
import { formatDate, formatDateTime, formatMoney, listResult, projectName } from "../lib/format";
import type { ListResult, ReferralReward } from "../types/domain";

const rewardLabels: Record<RewardStatus, string> = {
  [RewardStatus.PENDING]: "待达成",
  [RewardStatus.ACHIEVED]: "待财务审批",
  [RewardStatus.APPROVED]: "待发放",
  [RewardStatus.PAID]: "已发放",
  [RewardStatus.CANCELLED]: "已取消"
};

type ReviewValues = { notes: string; reference?: string; proof?: string; paidAt?: Dayjs };

function ReferralRewardsContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<RewardStatus>();
  const [keyword, setKeyword] = useState("");
  const [reviewing, setReviewing] = useState<ReferralReward>();
  const [nextStatus, setNextStatus] = useState<RewardStatus>();
  const [detail, setDetail] = useState<ReferralReward>();
  const [form] = Form.useForm<ReviewValues>();
  const [saving, setSaving] = useState(false);

  const resource = useApiResource(
    async () => mapList(await api.get<ListResult<ReferralReward> | ReferralReward[]>("/referral-rewards", { page, pageSize, status, keyword }), adaptReward, page, pageSize),
    [page, pageSize, status, keyword]
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;

  const openReview = (reward: ReferralReward, targetStatus: RewardStatus) => {
    setReviewing(reward);
    setNextStatus(targetStatus);
    form.resetFields();
    if (targetStatus === RewardStatus.PAID) form.setFieldsValue({ paidAt: dayjs() });
  };

  const submitReview = async (values: ReviewValues) => {
    if (!reviewing || !nextStatus) return;
    setSaving(true);
    try {
      await api.patch(`/referral-rewards/${reviewing.id}`, { status: nextStatus, notes: values.notes, ...(nextStatus === RewardStatus.PAID ? { payment: { reference: values.reference, proof: values.proof, paidAt: values.paidAt?.toISOString() } } : {}) });
      message.success("奖励状态已更新");
      setReviewing(undefined);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<ReferralReward> = [
    { title: "被推荐人", fixed: "left", width: 190, render: (_, row) => <div className="recruitment-cell"><strong className="recruitment-job-title">{row.person?.name ?? "—"}</strong><span className="recruitment-cell-muted">{row.person?.phone || "—"}</span><span className="recruitment-cell-muted">{row.referral?.jobDemand?.title ?? "—"}</span></div> },
    { title: "项目", width: 170, render: (_, row) => row.person ? projectName(row.person) : "—" },
    { title: "推荐人", width: 130, render: (_, row) => row.recommender?.displayName || row.recommender?.username || "—" },
    { title: "奖励规则", width: 215, render: (_, row) => <div className="recruitment-cell"><strong className="recruitment-salary">{formatMoney(row.amount)}</strong><span>{row.referral?.policySnapshot?.name ?? row.policy?.name ?? "—"}</span><span className="recruitment-cell-muted">报名版本 {row.referral?.policySnapshot?.version ? `v${row.referral.policySnapshot.version}` : "待核实"} · 入职满 {row.eligibility?.retentionDays ?? row.referral?.policySnapshot?.retentionDays ?? "—"} 天</span></div> },
    { title: "条件核实", width: 235, render: (_, row) => <div className="recruitment-cell"><StatusTag status={row.person?.employmentStatus ?? row.person?.status} /><span className="recruitment-cell-muted">入职 {formatDate(row.person?.onboardDate)}</span><span className={row.eligibility?.eligible ? "success-text" : "recruitment-cell-muted"}>{row.eligibility?.reason ?? "待核实报名规则"}</span>{row.eligibility?.eligibleAt ? <span className="recruitment-cell-muted">满期日 {formatDate(row.eligibility.eligibleAt)}</span> : null}</div> },
    { title: "奖励状态", dataIndex: "status", width: 110, render: (value: RewardStatus) => <StatusTag status={value} /> },
    {
      title: "操作",
      fixed: "right",
      width: 225,
      render: (_, row) => (
        <Space wrap size={[4, 4]}>
          <Button type="link" size="small" onClick={() => setDetail(row)}>详情</Button>
          {row.status === RewardStatus.PENDING && can(Permission.REWARD_REVIEW) ? <Button type="link" size="small" disabled={!row.eligibility?.eligible} icon={<CheckCircleOutlined />} onClick={() => openReview(row, RewardStatus.ACHIEVED)}>核实达成</Button> : null}
          {row.status === RewardStatus.ACHIEVED && can(Permission.REWARD_APPROVE) ? <Button type="link" size="small" disabled={!row.eligibility?.eligible} onClick={() => openReview(row, RewardStatus.APPROVED)}>财务审批</Button> : null}
          {row.status === RewardStatus.APPROVED && can(Permission.REWARD_PAY) ? <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => openReview(row, RewardStatus.PAID)}>登记发放</Button> : null}
          {([RewardStatus.PENDING, RewardStatus.ACHIEVED, RewardStatus.APPROVED] as RewardStatus[]).includes(row.status) && (can(Permission.REWARD_APPROVE) || (row.status !== RewardStatus.APPROVED && can(Permission.REWARD_REVIEW))) ? <Button type="link" size="small" danger onClick={() => openReview(row, RewardStatus.CANCELLED)}>取消</Button> : null}
          {row.status === RewardStatus.PAID ? <Tag color="green">已留存付款记录</Tag> : null}
        </Space>
      )
    }
  ];

  return (
    <RecruitmentWorkspace>
      <RecruitmentModuleNav />
      <PageHeader title="推荐奖励" description="达成核实 → 财务审批 → 登记发放。按报名时的规则与金额核实，每次操作保留记录。" extra={<Button icon={<ReloadOutlined />} loading={resource.loading} onClick={() => void resource.reload()}>刷新</Button>} />
      <ContentCard>
        <div className="filter-grid compact">
          <Input.Search allowClear placeholder="搜索被推荐人 / 手机号 / 推荐人" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
          <Select allowClear placeholder="奖励状态" value={status} options={Object.entries(rewardLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
        </div>
        {resource.error ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<ReferralReward>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1500 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条奖励记录` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无推荐奖励记录" }}
          />
        )}
      </ContentCard>

      <Modal title={nextStatus === RewardStatus.PAID ? "登记奖励发放" : nextStatus === RewardStatus.APPROVED ? "财务审批" : nextStatus === RewardStatus.CANCELLED ? "取消奖励" : "核实奖励达成"} open={Boolean(reviewing)} confirmLoading={saving} onCancel={() => { if (!saving) setReviewing(undefined); }} onOk={() => form.submit()} okText={nextStatus === RewardStatus.PAID ? "保存付款记录" : "确认并保存"} cancelText="取消" destroyOnHidden>
        {nextStatus === RewardStatus.PAID ? <Alert type="info" showIcon className="form-context-alert" title="完成实际付款后，登记付款流水与凭证" description="保存后奖励显示为已发放，付款记录不可回退。" /> : <Alert type={nextStatus === RewardStatus.CANCELLED ? "warning" : "info"} showIcon className="form-context-alert" title={nextStatus === RewardStatus.CANCELLED ? "取消后不能恢复，请说明原因" : reviewing?.eligibility?.reason ?? "请逐项核实规则条件"} description={reviewing?.referral?.policySnapshot?.achievementConditions ?? "报名快照未记录其他条件，请先核实原始规则"} />}
        <Form<ReviewValues> form={form} layout="vertical" onFinish={(values) => void submitReview(values)}>
          <Form.Item label="被推荐人"><Input value={reviewing?.person?.name ?? "—"} disabled /></Form.Item>
          <Form.Item label="绑定政策"><Input value={reviewing?.policy?.name ?? "—"} disabled /></Form.Item>
          <Form.Item label="奖励金额"><Input value={formatMoney(reviewing?.amount)} disabled /></Form.Item>
          {nextStatus === RewardStatus.PAID ? <>
            <Form.Item name="reference" label="实际付款流水号" rules={[{ required: true, whitespace: true, message: "请输入付款流水号" }]}><Input maxLength={120} placeholder="银行或支付渠道的实际交易流水" /></Form.Item>
            <Form.Item name="proof" label="付款凭证" rules={[{ required: true, whitespace: true, min: 4, message: "请填写至少 4 字的凭证说明或凭证链接" }]}><Input.TextArea rows={2} maxLength={1000} placeholder="凭证存储链接或可核实的付款凭证说明" /></Form.Item>
            <Form.Item name="paidAt" label="实际付款时间" rules={[{ required: true, message: "请选择实际付款时间" }, { validator(_, value?: Dayjs) { return !value || (!value.isAfter(dayjs()) && (!reviewing?.approvedAt || !value.isBefore(dayjs(reviewing.approvedAt)))) ? Promise.resolve() : Promise.reject(new Error("付款时间须在财务审批后，且不晚于当前时间")); } }]}><DatePicker showTime className="full-width" /></Form.Item>
          </> : null}
          <Form.Item name="notes" label={nextStatus === RewardStatus.CANCELLED ? "取消原因" : nextStatus === RewardStatus.PAID ? "发放说明" : "核实 / 审批说明"} rules={[{ required: true, whitespace: true, message: "请填写本次操作说明" }]}><Input.TextArea rows={3} maxLength={1000} showCount placeholder="具体说明核实依据、审批结果或发放事项" /></Form.Item>
        </Form>
      </Modal>
      <Drawer title="推荐奖励详情" size={720} open={Boolean(detail)} onClose={() => setDetail(undefined)}>
        {detail ? <>
          <div className="recruitment-reward-heading"><Typography.Title level={2}>{formatMoney(detail.amount)}</Typography.Title><StatusTag status={detail.status} /></div>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="被推荐人">{detail.person?.name ?? "—"} · {detail.person?.phone || "—"}</Descriptions.Item>
            <Descriptions.Item label="推荐人">{detail.recommender?.displayName || detail.recommender?.username || "—"}</Descriptions.Item>
            <Descriptions.Item label="岗位 / 项目">{detail.referral?.jobDemand?.title ?? "—"} / {detail.person ? projectName(detail.person) : "—"}</Descriptions.Item>
            <Descriptions.Item label="报名时规则版本">{detail.referral?.policySnapshot?.name ?? detail.policy?.name ?? "—"} · {detail.referral?.policySnapshot?.version ? `v${detail.referral.policySnapshot.version}` : "原始版本待核实"}</Descriptions.Item>
            <Descriptions.Item label="约定在岗天数">{detail.eligibility?.retentionDays ?? detail.referral?.policySnapshot?.retentionDays ?? "待核实"} 天</Descriptions.Item>
            <Descriptions.Item label="达成条件">{detail.referral?.policySnapshot?.achievementConditions ?? "报名快照未记录，请核实原始规则"}</Descriptions.Item>
            <Descriptions.Item label="不发放条件">{detail.referral?.policySnapshot?.exclusionConditions || "报名快照未记录"}</Descriptions.Item>
            <Descriptions.Item label="在岗条件核实">{detail.eligibility?.reason ?? "待核实"}</Descriptions.Item>
            <Descriptions.Item label="满期日期">{formatDate(detail.eligibility?.eligibleAt)}</Descriptions.Item>
            <Descriptions.Item label="达成 / 财务审批时间">{formatDateTime(detail.achievedAt)} / {formatDateTime(detail.approvedAt)}</Descriptions.Item>
            <Descriptions.Item label="最近操作说明">{detail.notes || "—"}</Descriptions.Item>
          </Descriptions>
          {detail.payment ? <><Typography.Title level={5} className="section-title">实际付款记录</Typography.Title><Descriptions bordered column={1} size="small"><Descriptions.Item label="付款流水">{detail.payment.reference}</Descriptions.Item><Descriptions.Item label="付款凭证">{detail.payment.proof}</Descriptions.Item><Descriptions.Item label="付款时间">{formatDateTime(detail.payment.paidAt)}</Descriptions.Item></Descriptions></> : null}
        </> : null}
      </Drawer>
    </RecruitmentWorkspace>
  );
}

export function ReferralRewardsPage() {
  return <PermissionGuard permission={Permission.REWARD_READ} anyOf={[Permission.REWARD_REVIEW]}><ReferralRewardsContent /></PermissionGuard>;
}
