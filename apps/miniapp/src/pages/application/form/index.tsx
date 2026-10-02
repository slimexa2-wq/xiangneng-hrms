import Taro from "@tarojs/taro";
import { RegistrationForm } from "../../../components/registration-form";
import { AccessDenied, PageShell } from "../../../components/ui";
import { isEmployeeRole, isOperatorRole, isSupplierRole } from "../../../domain/roles";
import { useSession } from "../../../hooks/useSession";
import type { RegistrationInput } from "../../../api/types";

export default function ApplicationFormPage() {
  const user = useSession(false);
  const params = Taro.getCurrentInstance().router?.params ?? {};
  if (user && !user.permissions.includes("application:create") && !user.permissions.includes("referral:create")) return <AccessDenied />;

  let source: RegistrationInput["source"] = "SELF";
  if (isSupplierRole(user?.role)) source = "SUPPLIER";
  else if (isEmployeeRole(user?.role) && user?.permissions.includes("referral:create")) source = "REFERRAL";
  else if (user && isOperatorRole(user.role)) source = "OPERATOR";

  const title = source === "REFERRAL" ? "推荐报名" : source === "SUPPLIER" ? "立即报人" : "报名这份工作";
  return (
    <PageShell title={title} subtitle={source === "SELF" ? "填好姓名和联系电话，负责人将联系你" : "岗位已选好，填写真实报名信息"} className={source === "SELF" || source === "REFERRAL" ? "recruitment-shell recruitment-form-shell" : ""}>
      <RegistrationForm
        source={source}
        initialJobId={params.jobId}
        publicMode={!user}
        referralToken={params.ref}
        submitText={source === "REFERRAL" ? "提交推荐" : "提交报名"}
        onSuccess={() => void Taro.navigateBack()}
      />
    </PageShell>
  );
}
