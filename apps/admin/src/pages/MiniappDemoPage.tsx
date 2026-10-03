import { useMemo, useState, type ReactNode } from "react";
import {
  ApartmentOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { Alert, Button, Card, Space, Tag, Typography } from "antd";

type DemoRole = "personal" | "operator" | "project" | "supplier";

const portalOrigin = (import.meta.env.VITE_PORTAL_ORIGIN as string | undefined) ?? "http://127.0.0.1:4320";

const roleOptions: Array<{
  id: DemoRole;
  label: string;
  subtitle: string;
  route: string;
  icon: ReactNode;
  highlights: string[];
}> = [
  {
    id: "personal",
    label: "个人/员工端",
    subtitle: "岗位、报名、推荐、工资条与个人服务",
    route: "/personal/home",
    icon: <UserOutlined />,
    highlights: ["岗位筛选与详情", "在线报名/收藏", "推荐与个人服务"]
  },
  {
    id: "operator",
    label: "内部管理端",
    subtitle: "工作台、人员、项目与现场运营",
    route: "/internal/dashboard",
    icon: <TeamOutlined />,
    highlights: ["实时业务看板", "人员生命周期", "岗位发布与二维码"]
  },
  {
    id: "project",
    label: "项目负责人端",
    subtitle: "授权项目的需求、人员和招聘进度",
    route: "/internal/projects",
    icon: <ApartmentOutlined />,
    highlights: ["项目范围隔离", "岗位需求维护", "招聘进度联动"]
  },
  {
    id: "supplier",
    label: "供应商端",
    subtitle: "岗位、输送人员、结算与申诉",
    route: "/supplier/jobs",
    icon: <ShopOutlined />,
    highlights: ["岗位详情可点击", "人员与状态查询", "结算确认与申诉"]
  }
];

export function MiniappDemoPage() {
  const [role, setRole] = useState<DemoRole>("personal");
  const [frameVersion, setFrameVersion] = useState(0);
  const current = roleOptions.find((item) => item.id === role) ?? roleOptions[0]!;
  const src = useMemo(() => {
    const query = new URLSearchParams({ persona: current.id, redirect: current.route, embed: "1" });
    return `${portalOrigin}/entry?${query.toString()}`;
  }, [current]);

  return <main className="real-miniapp-demo">
    <section className="real-miniapp-heading">
      <div>
        <Space size={10} wrap>
          <Tag>好工到 · HRMS</Tag>
          <Tag>界面体验</Tag>
          <Tag>手机版</Tag>
        </Space>
        <Typography.Title level={2}>小程序界面体验</Typography.Title>
        <Typography.Paragraph>
          体验好工到找工作、报名与推荐，以及原有员工和运营服务。这里展示手机版网页；原生微信小程序通过微信开发者工具预览。
        </Typography.Paragraph>
      </div>
      <Space>
        <Button icon={<ReloadOutlined />} onClick={() => setFrameVersion((value) => value + 1)}>刷新小程序</Button>
        <Button type="primary" icon={<FullscreenOutlined />} href={src} target="_blank" rel="noreferrer">独立打开</Button>
      </Space>
    </section>

    <div className="real-miniapp-layout">
      <aside className="real-miniapp-control">
        <Card title="选择演示身份" variant="borderless">
          <div className="real-miniapp-roles">
            {roleOptions.map((item) => <button key={item.id} type="button" className={item.id === role ? "is-active" : ""} onClick={() => { setRole(item.id); setFrameVersion((value) => value + 1); }}>
              <span>{item.icon}</span>
              <div><strong>{item.label}</strong><small>{item.subtitle}</small></div>
            </button>)}
          </div>
        </Card>
        <Card title={current.label} variant="borderless">
          <ul className="real-miniapp-checklist">{current.highlights.map((item) => <li key={item}><SafetyCertificateOutlined />{item}</li>)}</ul>
        </Card>
        <Alert type="info" showIcon title="演示说明" description="演示账号只用于体验。求职报名、推荐奖励和人员状态的实际结果以 HRMS 后台记录为准；合成演示不向真实企业提交资料。" />
      </aside>

      <section className="real-miniapp-stage" aria-label={`${current.label}手机界面`}>
        <div className="real-phone-shadow" />
        <div className="real-phone-frame">
          <div className="real-phone-speaker" />
          <iframe key={`${role}-${frameVersion}`} title={`${current.label}小程序`} src={src} allow="clipboard-read; clipboard-write" />
          <div className="real-phone-home" />
        </div>
        <div className="real-miniapp-caption"><strong>{current.label}</strong><span>{current.subtitle}</span></div>
      </section>
    </div>
  </main>;
}
