import Taro from "@tarojs/taro";
import { RegistrationForm } from "../../../components/registration-form";
import { AccessDenied, PageShell } from "../../../components/ui";
import { isEmployeeRole, isOperatorRole, isSupplierRole } from "../../../domain/roles";
import { useSession } from "../../../hooks/useSession";
import type { RegistrationInput } from "../../../api/types";
import { jobDetailPath } from "../../../domain/links";
import { backOrHome } from "../../../utils/navigation";
import { Button } from "@tarojs/components";

export default function ApplicationFormPage() {
  const user = useSession(false);
  const params = Taro.getCurrentInstance().router?.params ?? {};

  let source: RegistrationInput["source"] = "SELF";
  if (isSupplierRole(user?.role)) source = "SUPPLIER";
  else if (params.action === "referral") {
    if (!isEmployeeRole(user?.role) || !user?.permissions.includes("referral:create")) return <AccessDenied message="推荐他人需要员工推荐权限。本人找工作请从岗位列表选择“立即报名”。" />;
    source = "REFERRAL";
  }
  else if (user && isOperatorRole(user.role)) source = "OPERATOR";
  const permission = source === "REFERRAL" ? "referral:create" : source === "OPERATOR" ? "people:write" : "application:create";
  if (user && !user.permissions.includes(permission)) return <AccessDenied message={source === "SELF" ? "当前账号没有本人报名权限，请核对账号身份或联系负责人。推荐他人请使用推荐奖励入口。" : "当前账号没有办理这类报名的权限，请返回自己的工作台。"} />;

  const title = source === "REFERRAL" ? "推荐报名" : source === "SUPPLIER" ? "立即报人" : "报名这份工作";
  return (
    <PageShell title={title} subtitle={source === "SELF" && user?.personId ? "使用已绑定的本人档案，确认后即可报名" : source === "SELF" ? "填好姓名和联系电话，负责人将联系你" : "岗位已选好，填写真实报名信息"} className={source === "SELF" || source === "REFERRAL" ? "recruitment-shell recruitment-form-shell" : ""}>
      <RegistrationForm
        key={`${user?.id ?? "public"}:${source}`}
        source={source}
        initialJobId={params.jobId}
        publicMode={!user}
        referralToken={params.ref}
        submitText={source === "REFERRAL" ? "提交推荐" : "提交报名"}
        onSuccess={() => void backOrHome(params.jobId ? jobDetailPath(params.jobId, params.ref) : "/pages/jobs/index/index")}
      />
      <Button className="button button--secondary" onClick={() => void backOrHome(params.jobId ? jobDetailPath(params.jobId, params.ref) : "/pages/jobs/index/index")}>返回岗位</Button>
    </PageShell>
  );
}
