import { NavLink } from "react-router-dom";
import { AppstoreOutlined, GiftOutlined, ProfileOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Permission } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";

export function RecruitmentModuleNav() {
  const { can } = useAuth();
  const items = [
    { path: "/recruitment/demands", label: "岗位发布", icon: <AppstoreOutlined />, visible: can(Permission.JOB_READ) },
    { path: "/recruitment/progress", label: "报名跟进", icon: <ProfileOutlined />, visible: can(Permission.JOB_READ) && can(Permission.PEOPLE_READ) },
    { path: "/policies/referral", label: "奖励规则", icon: <SafetyCertificateOutlined />, visible: can(Permission.POLICY_READ) },
    { path: "/recruitment/rewards", label: "奖励发放", icon: <GiftOutlined />, visible: can(Permission.REWARD_READ) || can(Permission.REWARD_REVIEW) }
  ];
  return <div className="recruitment-module-nav"><nav aria-label="招聘业务导航">{items.filter((item) => item.visible).map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => isActive ? "active" : ""}>{item.icon}{item.label}</NavLink>)}</nav><span className="recruitment-brand-caption">好工到 · 四川</span></div>;
}
