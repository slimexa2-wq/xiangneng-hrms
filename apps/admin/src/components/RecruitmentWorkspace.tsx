import type { PropsWithChildren } from "react";
import { ConfigProvider } from "antd";
import "./recruitment-workspace.css";

export function RecruitmentWorkspace({ children, enabled = true }: PropsWithChildren<{ enabled?: boolean }>) {
  if (!enabled) return children;
  return <ConfigProvider theme={{ token: { colorPrimary: "#0071e3", colorInfo: "#0071e3", colorText: "#1d1d1f", colorTextSecondary: "#6e6e73", colorBgLayout: "#f5f5f7", colorBorder: "#d9d9de", borderRadius: 12, controlHeight: 40, fontSize: 15, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif" }, components: { Card: { borderRadiusLG: 18 }, Table: { headerBg: "#f5f5f7", headerColor: "#6e6e73", cellPaddingBlock: 20 }, Modal: { borderRadiusLG: 20 } } }}><div className="recruitment-workspace">{children}</div></ConfigProvider>;
}
