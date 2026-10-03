import type { ReactNode } from 'react';
import { Bell, BriefcaseBusiness, Building2, ClipboardList, Gift, House, LogOut, ReceiptText, UserRound, UsersRound } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, demoFallbackEnabled } from '../app/api';
import type { MessageItem, Session } from '../app/types';
import { Avatar } from './Avatar';
import { BrandMark } from './BrandMark';
import { AiAssistant } from '../features/ai/AiAssistant';
import { useLogout } from '../app/useLogout';

export type Portal = 'personal' | 'internal' | 'supplier';

const navConfig = {
  personal: [
    { label: '找工作', to: '/personal/home', icon: BriefcaseBusiness },
    { label: '我的报名', to: '/personal/me/applications', icon: ClipboardList },
    { label: '推荐有奖', to: '/personal/referrals', icon: Gift },
    { label: '我的', to: '/personal/me', icon: UserRound }
  ],
  internal: [
    { label: '工作台', to: '/internal/dashboard', icon: House },
    { label: '人员', to: '/internal/people', icon: UsersRound },
    { label: '项目', to: '/internal/projects', icon: BriefcaseBusiness },
    { label: '我的', to: '/internal/me', icon: UserRound }
  ],
  supplier: [
    { label: '岗位需求', to: '/supplier/jobs', icon: ClipboardList },
    { label: '我的人员', to: '/supplier/people', icon: UsersRound },
    { label: '结算', to: '/supplier/settlements', icon: ReceiptText },
    { label: '我的', to: '/supplier/me', icon: UserRound }
  ]
} as const;

export function AppShell({ portal, session, title, children, wide = false }: { portal: Portal; session: Session; title: string; children: ReactNode; wide?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const jobDetail = portal === 'personal' && location.pathname.startsWith('/personal/jobs/');
  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api<MessageItem[]>('/api/messages'), staleTime: 20_000 });
  const unread = messages.data?.filter((message) => !message.isRead).length ?? 0;
  const logout = useLogout();
  const navItems = navConfig[portal];
  const messagePath = portal === 'personal' ? '/personal/messages' : portal === 'supplier' ? '/supplier/messages' : '/internal/messages';
  const personalNavClass = (to: string, isActive: boolean) => (to === '/personal/me'
    ? location.pathname.startsWith('/personal/me') && !location.pathname.startsWith('/personal/me/applications')
    : isActive) ? 'active' : '';

  if (portal === 'personal') return <div className="app-layout app-layout--personal recruitment-layout"><div className="app-stage">
    <header className="recruit-topbar"><div className="recruit-topbar-inner"><Link to="/personal/home" className="recruit-brand"><span><BriefcaseBusiness size={23} /></span><div><strong>好工到</strong><small>四川 · 祥能招聘</small></div></Link><nav className="recruit-desktop-nav">{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => personalNavClass(item.to, isActive)}>{item.label}</NavLink>)}</nav><div className="recruit-topbar-actions"><button className="icon-button" type="button" aria-label={`消息${unread ? `，${unread}条未读` : ''}`} onClick={() => navigate(messagePath)}><Bell size={21} />{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</button><button className="recruit-account-button" type="button" onClick={() => navigate("/personal/me")} aria-label="查看我的账号"><Avatar name={session.name} size={32} /><span>{session.name}</span></button></div></div></header>
    {demoFallbackEnabled && <div className="portal-demo-notice">演示体验 · 合成岗位，报名不会发送给真实企业</div>}
    <main className="app-content">{children}</main>
    {!jobDetail && <nav className="bottom-nav" aria-label="主要导航">{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => personalNavClass(item.to, isActive)}><item.icon size={22} /><span>{item.label}</span></NavLink>)}</nav>}
  </div></div>;

  return <div className={`app-layout app-layout--${portal}`}>
    <aside className="desktop-sidebar">
      <BrandMark compact />
      <div className="sidebar-profile"><Avatar name={session.name} size={44} /><div><strong>{session.name}</strong><span>{session.subtitle}</span></div></div>
      <nav>{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}><item.icon size={20} /><span>{item.label}</span></NavLink>)}</nav>
      <button type="button" className="sidebar-exit" onClick={() => logout.mutate()}><LogOut size={18} />切换身份</button>
    </aside>
    <div className="app-stage">
      <header className="mobile-header">
        <div className="mobile-brand"><span className="mobile-logo"><Building2 size={18} /></span><div><strong>{title}</strong><span>{session.subtitle}</span></div></div>
        <button className="icon-button" type="button" aria-label={`消息${unread ? `，${unread}条未读` : ''}`} onClick={() => navigate(messagePath)}><Bell size={21} />{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</button>
      </header>
      {demoFallbackEnabled && <div className="portal-demo-notice">演示体验 · 使用合成数据，报名和推荐不会发送给真实企业</div>}
      <main className={`app-content ${wide ? 'app-content--wide' : ''}`}>{children}</main>
      {!jobDetail && <nav className="bottom-nav">{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}><item.icon size={21} /><span>{item.label}</span></NavLink>)}</nav>}
    </div>
    {portal === 'internal' && <AiAssistant />}
  </div>;
}
