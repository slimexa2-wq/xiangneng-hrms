import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../../api/services";
import { clearSession } from "../../../auth/session";
import { FieldRow, PageShell, SectionCard } from "../../../components/ui";
import { runtimeConfig } from "../../../config/runtime";
import { isEmployeeRole, roleLabels } from "../../../domain/roles";
import { useSession } from "../../../hooks/useSession";
import { CandidateNavigation } from "../../../components/recruitment";

export default function ProfilePage() {
  const user = useSession(false);
  const [binding, setBinding] = useState(false);
  if (!user) return <PageShell title="我的" subtitle="报名记录和个人信息，只给本人看" className="recruitment-shell"><SectionCard title="欢迎来到好工到"><Text className="recruitment-body-text">可以先浏览岗位和报名。登录后，查看属于你的报名进度。</Text><View className="spacer" /><Button className="button" onClick={() => void Taro.navigateTo({ url: "/pages/login/index" })}>账号或微信登录</Button></SectionCard><SectionCard title="服务与说明"><Text className="link-text" onClick={() => void Taro.navigateTo({ url: "/pages/policy/index" })}>报名服务与隐私说明 ›</Text></SectionCard><CandidateNavigation active="profile" /></PageShell>;
  const personal = user.role === "JOB_SEEKER" || isEmployeeRole(user.role);
  const bindWechat = async () => {
    if (!runtimeConfig.wechatConfigured) {
      await Taro.showModal({
        title: "微信配置尚未完成",
        content: "微信身份绑定暂未开通，请先使用账号查看本人记录。",
        showCancel: false
      });
      return;
    }
    setBinding(true);
    try {
      const login = await Taro.login();
      const result = await api.bindWechat(login.code);
      await Taro.showToast({ title: result.bound ? "微信身份已绑定" : "绑定未完成", icon: result.bound ? "success" : "none" });
    } catch (error) {
      await Taro.showModal({
        title: "微信绑定失败",
        content: error instanceof Error ? error.message : "请稍后重试",
        showCancel: false
      });
    } finally {
      setBinding(false);
    }
  };
  const logout = async () => {
    const result = await Taro.showModal({ title: "退出登录", content: "确定退出当前账号吗？" });
    if (!result.confirm) return;
    clearSession();
    await Taro.reLaunch({ url: "/pages/login/index" });
  };
  return (
    <PageShell title={personal ? "我的" : "我的信息"} subtitle={personal ? "查看账号、本人记录和服务说明" : "账号身份决定入口、操作权限与数据范围"} showConfigGap={!personal} className={personal ? "recruitment-shell" : ""}>
      <SectionCard title="账号">
        <FieldRow label="姓名" value={user.displayName} />
        <FieldRow label="登录账号" value={user.username} />
        <FieldRow label="角色" value={roleLabels[user.role]} />
        {!personal ? <><FieldRow label="分子公司范围" value={user.branchId ?? "按账号配置"} /><FieldRow label="项目范围" value={user.projectIds.length ? user.projectIds.length + " 个项目" : "按角色规则"} /></> : null}
        <FieldRow label="人员绑定" value={user.personId ? "已绑定" : "未绑定"} />
        {!personal ? <FieldRow label="供应商绑定" value={user.supplierId ? "已绑定" : "未绑定"} /> : null}
      </SectionCard>
      {!personal ? <SectionCard title="权限">
        <FieldRow label="权限项数" value={String(user.permissions.length)} />
      </SectionCard> : <SectionCard title="我的服务"><View className="profile-service-links"><Text onClick={() => void Taro.navigateTo({ url: isEmployeeRole(user.role) ? "/pages/referrals/mine/index" : "/pages/application/mine/index" })}>{isEmployeeRole(user.role) ? "我的推荐" : "我的报名"} ›</Text>{isEmployeeRole(user.role) ? <Text onClick={() => void Taro.navigateTo({ url: "/pages/salary/index/index" })}>我的工资条 ›</Text> : null}<Text onClick={() => void Taro.navigateTo({ url: "/pages/policy/index" })}>报名服务与隐私说明 ›</Text></View></SectionCard>}
      <Button className="button button--secondary" loading={binding} disabled={binding} onClick={() => void bindWechat()}>
        绑定当前微信身份
      </Button>
      <Button className="button button--danger" onClick={() => void logout()}>退出登录</Button>
      {personal ? <CandidateNavigation active="profile" user={user} /> : null}
    </PageShell>
  );
}
