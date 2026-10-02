import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../api/services";
import { saveSession } from "../../auth/session";
import { FormField, TextField } from "../../components/form";
import { PageShell, SectionCard } from "../../components/ui";
import { runtimeConfig } from "../../config/runtime";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const finishLogin = async (task: () => ReturnType<typeof api.login>) => {
    setSubmitting(true);
    try {
      const result = await task();
      saveSession(result.token, result.user);
      await Taro.reLaunch({ url: "/pages/index/index" });
    } catch (error) {
      await Taro.showModal({
        title: "登录失败",
        content: error instanceof Error ? error.message : "请检查账号或网络配置",
        showCancel: false
      });
    } finally {
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
    setSubmitting(true);
    try {
      const login = await Taro.login();
      const result = await api.wechatLogin(login.code);
      saveSession(result.token, result.user);
      await Taro.reLaunch({ url: "/pages/index/index" });
    } catch (error) {
      await Taro.showModal({
        title: "微信登录失败",
        content: error instanceof Error ? error.message : "微信登录暂不可用",
        showCancel: false
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="登录" subtitle="查看本人记录和员工服务" className="recruitment-shell recruitment-form-shell">
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
      <Button className="button button--secondary" loading={submitting} disabled={submitting} onClick={() => void wechatLogin()}>
        微信身份登录
      </Button>
      <Button className="button button--secondary" onClick={() => void Taro.navigateTo({ url: "/pages/jobs/index/index" })}>
        暂不登录，浏览招聘岗位
      </Button>
      <View className="spacer" />
      <Text className="muted">求职可以先浏览岗位。登录后，按账号身份查看本人记录或进入对应工作台。</Text>
    </PageShell>
  );
}
