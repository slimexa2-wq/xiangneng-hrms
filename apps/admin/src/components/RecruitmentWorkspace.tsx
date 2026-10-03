import type { PropsWithChildren } from "react";
import { ConfigProvider } from "antd";
import "./recruitment-workspace.css";

export function RecruitmentWorkspace({ children, enabled = true }: PropsWithChildren<{ enabled?: boolean }>) {
  if (!enabled) return children;
  return <ConfigProvider theme={{ token: { colorPrimary: "#246bfd", colorInfo: "#246bfd", colorText: "#19263d", colorTextSecondary: "#79849a", colorBgLayout: "#f5f7fb", colorBorder: "#e2e8f2", borderRadius: 8, controlHeight: 38, fontSize: 14, fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" }, components: { Card: { borderRadiusLG: 14 }, Table: { headerBg: "#f8faff", headerColor: "#79849a", cellPaddingBlock: 16 }, Modal: { borderRadiusLG: 18 } } }}><div className="recruitment-workspace">{children}</div></ConfigProvider>;
}
