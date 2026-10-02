import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../../api/services";
import { clearSession, getSessionSnapshot, isSessionCurrent, saveSessionIfCurrent } from "../../../auth/session";
import { FieldRow, PageShell, SectionCard } from "../../../components/ui";
import { runtimeConfig } from "../../../config/runtime";
import { isEmployeeRole, roleLabels } from "../../../domain/roles";
import { useSession } from "../../../hooks/useSession";
import { CandidateNavigation } from "../../../components/recruitment";
import { loginPath } from "../../../domain/links";

export default function ProfilePage() {
  const user = useSession(false);
  const [binding, setBinding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  if (!user) return <PageShell title="我的" subtitle="报名记录和个人信息，只给本人看" className="recruitment-shell"><SectionCard title="欢迎来到好工到"><Text className="recruitment-body-text">可以先浏览岗位和报名。登录后，查看属于你的报名进度。</Text><View className="spacer" /><Button className="button" onClick={() => void Taro.navigateTo({ url: loginPath("/pages/profile/index/index") })}>账号或微信登录</Button></SectionCard><SectionCard title="服务与说明"><Text className="link-text" onClick={() => void Taro.navigateTo({ url: "/pages/policy/index" })}>报名服务与隐私说明 ›</Text></SectionCard><CandidateNavigation active="profile" /></PageShell>;
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
    const session = getSessionSnapshot();
    try {
      const login = await Taro.login();
      if (!isSessionCurrent(session)) return;
      const result = await api.bindWechat(login.code);
      if (!isSessionCurrent(session)) return;
      if (result.bound) {
        try {
          const current = await api.me();
          if (!saveSessionIfCurrent(session, current)) return;
        } catch {
          if (!isSessionCurrent(session)) return;
          await Taro.showModal({ title: "微信身份已绑定", content: "账号资料暂时无法刷新，可稍后点击刷新账号资料。", showCancel: false });
          return;
        }
      }
      await Taro.showToast({ title: result.bound ? "微信身份已绑定" : "绑定未完成", icon: result.bound ? "success" : "none" });
    } catch (error) {
      if (!isSessionCurrent(session)) return;
      await Taro.showModal({
        title: "微信绑定失败",
        content: error instanceof Error ? error.message : "请稍后重试",
        showCancel: false
      });
    } finally {
      setBinding(false);
    }
  };
  const refreshProfile = async () => {
    setRefreshing(true);
    const session = getSessionSnapshot();
    try {
      if (!session.token) throw new Error("请重新登录查看本人资料");
      const current = await api.me();
      if (!saveSessionIfCurrent(session, current)) return;
      await Taro.showToast({ title: "账号资料已刷新", icon: "success" });
    } catch (error) {
      if (!isSessionCurrent(session)) return;
      await Taro.showModal({ title: "暂时无法刷新", content: error instanceof Error ? error.message : "请稍后重试", showCancel: false });
    } finally { setRefreshing(false); }
  };
  const logout = async (switchAccount = false) => {
    const result = await Taro.showModal({ title: switchAccount ? "切换账号" : "退出登录", content: switchAccount ? "将退出当前账号。请用另一个已授权的账号登录，进入对应服务入口。" : "确定退出当前账号吗？", confirmText: switchAccount ? "切换" : "退出" });
    if (!result.confirm) return;
    clearSession();
    await Taro.reLaunch({ url: "/pages/login/index" });
  };
  return (
    <PageShell title={personal ? "我的" : "我的信息"} subtitle={personal ? "查看账号、本人记录和服务说明" : "账号身份决定入口、操作权限与数据范围"} showConfigGap={!personal} className={personal ? "recruitment-shell" : ""}>
      <SectionCard title="账号">
        <FieldRow label="姓名" value={user.displayName} />
        {/^wx_[a-f0-9]{40}$/.test(user.username) ? <FieldRow label="登录方式" value="微信登录" /> : <FieldRow label="登录账号" value={user.username} />}
        <FieldRow label="角色" value={roleLabels[user.role]} />
        {!personal ? <><FieldRow label="分子公司范围" value={user.branchId ?? "按账号配置"} /><FieldRow label="项目范围" value={user.projectIds.length ? user.projectIds.length + " 个项目" : "按角色规则"} /></> : null}
        <FieldRow label="人员绑定" value={user.personId ? "已绑定" : "未绑定"} />
        {!personal ? <FieldRow label="供应商绑定" value={user.supplierId ? "已绑定" : "未绑定"} /> : null}
      </SectionCard>
      {!personal ? <SectionCard title="权限">
        <FieldRow label="权限项数" value={String(user.permissions.length)} />
      </SectionCard> : <SectionCard title="我的服务"><View className="profile-service-links"><View ariaRole="button" ariaLabel="查看本人报名进度" onClick={() => void Taro.navigateTo({ url: "/pages/application/mine/index" })}>我的报名 ›</View>{isEmployeeRole(user.role) && user.permissions.includes("referral:create") ? <View ariaRole="button" ariaLabel="查看我推荐的好友" onClick={() => void Taro.navigateTo({ url: "/pages/referrals/mine/index" })}>我的推荐 ›</View> : null}{isEmployeeRole(user.role) && user.permissions.includes("salary:self-read") ? <View ariaRole="button" ariaLabel="查看本人工资条" onClick={() => void Taro.navigateTo({ url: "/pages/salary/index/index" })}>我的工资条 ›</View> : null}<View ariaRole="button" ariaLabel="阅读报名服务与隐私说明" onClick={() => void Taro.navigateTo({ url: "/pages/policy/index" })}>报名服务与隐私说明 ›</View></View></SectionCard>}
      <Button className="button button--secondary" loading={refreshing} disabled={refreshing || binding} onClick={() => void refreshProfile()}>刷新账号资料</Button>
      <Button className="button button--secondary" loading={binding} disabled={binding || refreshing} onClick={() => void bindWechat()}>
        绑定当前微信身份
      </Button>
      <Button className="button button--secondary" onClick={() => void Taro.reLaunch({ url: user.role === "JOB_SEEKER" ? "/pages/jobs/index/index" : "/pages/index/index" })}>{user.role === "JOB_SEEKER" ? "返回找工作" : "返回工作台"}</Button>
      <Button className="button button--secondary" onClick={() => void logout(true)}>切换账号</Button>
      <Button className="button button--danger" onClick={() => void logout()}>退出登录</Button>
      {personal ? <CandidateNavigation active="profile" user={user} /> : null}
    </PageShell>
  );
}
