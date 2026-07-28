import Taro from "@tarojs/taro";
import { Button, Picker, Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../../api/services";
import type { ReimbursementStatus } from "../../../api/types";
import { AccessDenied, AsyncBoundary, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { centsToYuan, canCreateReimbursement, reimbursementPermissions, reimbursementStatusLabel } from "../../../domain/reimbursements";
import { formatDate } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

const filterOptions: Array<{ label: string; value: "" | ReimbursementStatus }> = [
  { label: "全部状态", value: "" },
  { label: "待提交", value: "PENDING_SUBMISSION" },
  { label: "部门制单中", value: "DEPARTMENT_PREPARING" },
  { label: "负责人审核中", value: "OWNER_REVIEWING" },
  { label: "财务审核中", value: "FINANCE_REVIEWING" },
  { label: "审核通过", value: "APPROVED" },
  { label: "待付款", value: "PENDING_PAYMENT" },
  { label: "已付款", value: "PAID" }
];

export default function ReimbursementListPage() {
  const user = useSession();
  const [status, setStatus] = useState<"" | ReimbursementStatus>("");
  const batches = useAsyncData(() => api.reimbursements(status ? { status } : {}), [status]);

  if (!user) return <PageShell title="报销中心" />;
  if (!user.permissions.some((permission) => permission.startsWith("reimbursement:"))) {
    return <AccessDenied message="当前岗位没有报销查看或办理权限。" />;
  }

  const selectedIndex = Math.max(0, filterOptions.findIndex((item) => item.value === status));
  const createAllowed = canCreateReimbursement(user);
  const workMode = [
    reimbursementPermissions.manage,
    reimbursementPermissions.approve,
    reimbursementPermissions.financeReview,
    reimbursementPermissions.pay,
    reimbursementPermissions.export
  ].some((permission) => user.permissions.includes(permission));
  const pageTitle = createAllowed && workMode ? "报销中心" : createAllowed ? "我的报销" : "报销待办";

  return (
    <PageShell
      title={pageTitle}
      subtitle="页面数据同时受岗位职责和组织范围限制"
    >
      <View className="reimbursement-toolbar">
        <Picker
          mode="selector"
          range={filterOptions}
          rangeKey="label"
          value={selectedIndex}
          onChange={(event) => setStatus(filterOptions[Number(event.detail.value)]?.value ?? "")}
        >
          <View className="reimbursement-filter">{filterOptions[selectedIndex]?.label ?? "全部状态"}⌄</View>
        </Picker>
        {createAllowed ? (
          <Button
            className="button reimbursement-create-button"
            onClick={() => void Taro.navigateTo({ url: "/pages/reimbursements/form/index" })}
          >
            发起报销
          </Button>
        ) : null}
      </View>

      <AsyncBoundary
        loading={batches.loading}
        error={batches.error}
        empty={!batches.data?.items.length}
        emptyText="暂无符合条件的报销单"
        onRetry={() => void batches.reload()}
      >
        {(batches.data?.items ?? []).map((batch) => {
          const openIssues = batch.issues?.filter((issue) => issue.status === "OPEN").length ?? batch._count?.issues ?? 0;
          return (
            <View
              className="reimbursement-card"
              key={batch.id}
              onClick={() => void Taro.navigateTo({ url: `/pages/reimbursements/detail/index?id=${encodeURIComponent(batch.id)}` })}
            >
              <View className="card-title-row">
                <Text className="card-title">{batch.title}</Text>
                <StatusTag status={batch.status} label={reimbursementStatusLabel(batch.status)} />
              </View>
              <Text className="card-meta">{batch.code} · {batch.applicant.displayName}</Text>
              <Text className="reimbursement-money">¥{centsToYuan(batch.totalPaymentCents)}</Text>
              <View className="reimbursement-card__footer">
                <Text className="muted">{formatDate(batch.createdAt)} · {batch._count?.lines ?? batch.lines?.length ?? 0} 条明细</Text>
                <Text className={openIssues ? "reimbursement-issue-count" : "muted"}>
                  {openIssues ? `${openIssues} 个问题待处理` : "查看详情 ›"}
                </Text>
              </View>
            </View>
          );
        })}
      </AsyncBoundary>
    </PageShell>
  );
}
