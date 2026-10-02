import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useRef, useState } from "react";
import { api } from "../../api/services";
import { getSessionSnapshot, isSessionCurrent, saveSession } from "../../auth/session";
import { FormField, TextField } from "../../components/form";
import { PageShell, SectionCard } from "../../components/ui";
import { runtimeConfig } from "../../config/runtime";
import { afterLoginPath, safeLoginReturnTo } from "../../domain/links";
import { backOrHome } from "../../utils/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const returnTo = safeLoginReturnTo(Taro.getCurrentInstance().router?.params.returnTo);
  const preferWechat = Taro.getCurrentInstance().router?.params.method === "wechat";

  const finishLogin = async (task: () => ReturnType<typeof api.login>) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const session = getSessionSnapshot();
    try {
      const result = await task();
      if (!isSessionCurrent(session)) return;
      saveSession(result.token, result.user);
      await Taro.reLaunch({ url: afterLoginPath(returnTo, result.user) });
    } catch (error) {
      await Taro.showModal({
        title: "登录失败",
        content: error instanceof Error ? error.message : "请检查账号或网络配置",
        showCancel: false
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const passwordLogin = async () => {
    if (!username.trim() || !password) {
      await Taro.showToast({ title: "请输入账号和密码", icon: "none" });
      return;
    }
    await finishLogin(() => api.login(username.trim(), password));
  };

  const wechatLogin = async () => {
    if (!runtimeConfig.wechatConfigured) {
      await Taro.showModal({
        title: "微信登录暂未开通",
        content: "请先使用账号登录。如果还没有账号，可以先浏览岗位并提交报名。",
        showCancel: false
      });
      return;
    }
    await finishLogin(async () => {
      const login = await Taro.login();
      return api.wechatLogin(login.code);
    });
  };

  return (
    <PageShell title="登录" subtitle="查看本人记录和员工服务" className="recruitment-shell recruitment-form-shell">
      {preferWechat ? <SectionCard title="微信登录后继续报名"><Text className="muted">{runtimeConfig.wechatConfigured ? "登录成功后会返回刚才的岗位，保留推荐关系。" : "微信登录暂未开通，可以使用下方账号登录，或返回匿名报名。"}</Text><Button className="button" disabled={submitting || !runtimeConfig.wechatConfigured} loading={submitting} onClick={() => void wechatLogin()}>{runtimeConfig.wechatConfigured ? "微信登录" : "微信登录暂未开通"}</Button></SectionCard> : null}
      <SectionCard title="账号登录">
        <FormField label="账号" required>
          <TextField value={username} placeholder="请输入账号" onChange={setUsername} />
        </FormField>
        <FormField label="密码" required>
          <TextField value={password} placeholder="请输入密码" onChange={setPassword} password />
        </FormField>
        <Button className="button" loading={submitting} disabled={submitting} onClick={() => void passwordLogin()}>
          登录
        </Button>
      </SectionCard>
      {!preferWechat ? <Button className="button button--secondary" loading={submitting} disabled={submitting} onClick={() => void wechatLogin()}>
        微信身份登录
      </Button> : null}
      <Button className="button button--secondary" disabled={submitting} onClick={() => void backOrHome(returnTo ?? "/pages/jobs/index/index")}>
        {returnTo ? "暂不登录，返回继续" : "暂不登录，浏览岗位"}
      </Button>
      <View className="spacer" />
      <Text className="muted">求职可以先浏览岗位。登录后，按账号身份查看本人记录或进入对应工作台。</Text>
    </PageShell>
  );
}
