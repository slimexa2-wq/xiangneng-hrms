import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Bookmark, BriefcaseBusiness, Boxes, Factory, PackageCheck, Wrench, CalendarClock, Check, ChevronRight, CircleDollarSign,
  Clock3, FileText, Gift, Headphones, HelpCircle, MapPin, MessageSquareText, Phone,
  Send, Settings, Share2, ShieldCheck, Star, UserRound, UsersRound, WalletCards
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, jsonBody } from '../../app/api';
import { formatSalaryRange } from '../../app/format';
import { hasJobPreference, isRecruiting, jobBenefits, jobSalary, recruitmentCities, referralRewardLabel } from '../../app/recruitment';
import { ApplyDialog } from './ApplyDialog';
import type { Job, MessageItem, Person, Session } from '../../app/types';
import { Avatar } from '../../components/Avatar';
import { DetailLine, JobCard, SalaryLabel } from '../../components/DataCards';
import { StatusTag } from '../../components/StatusTag';
import { Card, EmptyState, Field, FilterSelect, LoadingScreen, Modal, PageHeader, SearchInput } from '../../components/Ui';

interface Catalog { projects: Array<{ id: string; name: string; region: string }>; }

const jobCategories = [
  { label: '全部岗位', value: '', icon: BriefcaseBusiness },
  { label: '工厂普工', value: '操作工', icon: Factory },
  { label: '仓储物流', value: '仓储', icon: Boxes },
  { label: '质检包装', value: '质检', icon: PackageCheck },
  { label: '技能岗位', value: '技术岗', icon: Wrench }
];

export function PersonalHome({ session }: { session: Session }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [salary, setSalary] = useState('');
  const [benefit, setBenefit] = useState('');
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  if (type) params.set('jobType', type);
  if (region) params.set('region', region);
  if (salary) params.set('salary', salary);
  const jobs = useQuery({ queryKey: ['jobs', query, type, region, salary], queryFn: () => api<Job[]>(`/api/jobs?${params}`) });
  const items = (jobs.data ?? []).filter((job) => !benefit || hasJobPreference(job, benefit));
  const activeFilters = Boolean(query || type || region || salary || benefit);
  return <div className="recruit-home">
    <div className="recruit-page-title"><div><h1>找工作</h1><p className="recruit-region-caption">成都 · 宜宾 · 绵阳</p></div><Link className="recruit-my-application" to="/personal/me/applications"><FileText size={20} />我的报名</Link></div>
    <SearchInput value={query} onChange={setQuery} placeholder="搜索岗位、公司或工作地点" />
    <div className="recruit-city-tabs" aria-label="工作城市">{recruitmentCities.map((city) => <button key={city.label} type="button" aria-pressed={region === city.value} className={region === city.value ? 'active' : ''} onClick={() => setRegion(city.value)}>{city.label}</button>)}</div>
    <div className="recruit-categories" aria-label="工种">{jobCategories.map((category) => <button key={category.label} type="button" aria-pressed={type === category.value} className={type === category.value ? 'active' : ''} onClick={() => setType(category.value)}><span>{category.label}</span></button>)}</div>
    <div className="recruit-benefit-filters">{['包吃', '包住', '长白班'].map((value) => <button key={value} type="button" aria-pressed={benefit === value} className={benefit === value ? 'active' : ''} onClick={() => setBenefit(benefit === value ? '' : value)}>{value}</button>)}<FilterSelect label="工资范围" value={salary} onChange={setSalary} options={[{ label: '4000–6000元', value: '4000-6000' }, { label: '6000–8000元', value: '6000-8000' }, { label: '8000元以上', value: '8000-' }]} /></div>
    <div className="recruit-workspace"><section className="recruit-results"><div className="recruit-result-heading"><h2>{region ? `${recruitmentCities.find((city) => city.value === region)?.label}岗位` : '正在招聘'}</h2><span>共 {items.length} 个岗位</span>{activeFilters && <button className="text-button" type="button" onClick={() => { setQuery(''); setType(''); setRegion(''); setSalary(''); setBenefit(''); }}>清空筛选</button>}</div>
      {jobs.isLoading ? <LoadingScreen /> : jobs.error ? <EmptyState title="岗位暂时没加载出来" detail="网络可能不稳定，请重试。已填写的信息不会丢失。" action={<button className="primary-button" onClick={() => void jobs.refetch()}>重新加载</button>} /> : items.length ? <div className="job-list">{items.map((job) => <JobCard key={job.id} job={job} onApply={setApplyJob} />)}</div> : <EmptyState title="暂时没有合适的岗位" detail="换个城市、工种，或清空筛选看看。" action={<button className="secondary-button" onClick={() => { setQuery(''); setType(''); setSalary(''); setBenefit(''); }}>放宽筛选</button>} />}
    </section></div>
    <ApplyDialog job={applyJob} onClose={() => setApplyJob(null)} />
  </div>;
}

export function PersonalJobDetail() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api<Job>(`/api/jobs/${id}`) });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api<Job[]>('/api/favorites') });
  const favorite = useMutation({ mutationFn: () => api<{ favorite: boolean }>(`/api/favorites/${id}`, { method: 'PUT' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }) });
  if (job.isLoading) return <LoadingScreen />;
  if (!job.data) return <EmptyState title="岗位暂时无法查看" detail={job.error?.message ?? '该岗位可能已结束，请返回查看其他岗位。'} action={<Link className="secondary-button" to="/personal/home">找其他工作</Link>} />;
  const item = job.data;
  return <div className="detail-page-with-bar recruit-detail">
    <PageHeader title="岗位详情" back action={<button className={`icon-button ${favorites.data?.some((saved) => saved.id === id) ? 'is-saved' : ''}`} type="button" aria-label="收藏岗位" onClick={() => favorite.mutate()} disabled={favorite.isPending}><Star size={20} fill={favorites.data?.some((saved) => saved.id === id) ? 'currentColor' : 'none'} /></button>} />
    <Card className="job-detail-card"><div className="row row--between"><h1>{item.title}</h1><StatusTag status={item.status} /></div><SalaryLabel job={item} /><p className="bluecollar-company">{item.projectName}</p><div className="bluecollar-benefits">{jobBenefits(item).map((value) => <span key={value}>{value}</span>)}</div>{favorite.error && <p className="form-error" role="alert">{favorite.error.message}</p>}</Card>
    <Card className="detail-section"><DetailLine icon="map" label="工作地点" value={item.address || item.region || '请咨询负责人'} /><DetailLine icon="users" label="招聘人数" value={`${item.headcount} 人`} /><DetailLine icon="time" label="工作时间" value={item.work_time || '请咨询负责人'} /><DetailLine label="报名截止" value={item.deadline || '请咨询负责人'} /><DetailLine label="所属公司" value={item.companyName || '请咨询负责人确认签约主体'} /></Card>
    <Card className="detail-section rich-detail"><h2>工资待遇</h2><p>{jobSalary(item)}</p><p>实际收入、加班费、结算日期及扣费项目，请在入职前与招聘负责人确认。</p><h2>岗位要求</h2><p>{item.requirements || '暂无补充要求，请联系负责人。'}</p><h2>工作内容</h2><p>{item.duties || item.projectDescription || '暂无补充说明，请联系负责人。'}</p><h2>吃住与福利</h2><p>{item.benefits || '尚未填写，请向负责人确认。'}</p></Card>
    <Card className="recruit-detail-referral"><Gift /><div><h2>推荐奖励</h2><p>{item.referral_policy || '当前岗位尚未公布推荐奖励政策。'}</p>{item.referral_retention_days && <p>需在职满 {item.referral_retention_days} 天，按报名时的政策审核。</p>}</div></Card>
    <Card className="detail-section rich-detail"><h2>招聘负责人</h2><p>{item.managerName || '请联系项目运营'}{item.managerPhone ? ` · ${item.managerPhone}` : ''}</p><p className="recruit-safe-note">求职报名免费，请核实工作地点、签约单位及具体工资待遇。</p></Card>
    <div className="fixed-action-bar">{item.managerPhone ? <a className="secondary-button" href={`tel:${item.managerPhone}`}><Phone size={18} />电话咨询</a> : <span className="recruit-contact-unavailable">联系电话待补充</span>}<button className="primary-button" type="button" disabled={!isRecruiting(item)} onClick={() => setConfirmOpen(true)}>{isRecruiting(item) ? '立即报名' : '暂停报名'}</button><Link className="secondary-button" to="/personal/referrals"><Share2 size={18} />推荐好友</Link></div>
    <ApplyDialog job={confirmOpen ? item : null} referralToken={searchParams.get('ref') ?? undefined} onClose={() => setConfirmOpen(false)} />
  </div>;
}

const messageTabs = [{ label: '全部', value: '' }, { label: '招聘进度', value: 'application' }, { label: '工资通知', value: 'payroll' }, { label: '面试安排', value: 'interview' }, { label: '推荐奖励', value: 'referral' }];

export function MessagesPage({ portal = 'personal' }: { portal?: 'personal' | 'supplier' | 'internal' }) {
  const [tab, setTab] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api<MessageItem[]>('/api/messages') });
  const markRead = useMutation({ mutationFn: (id: string) => api(`/api/messages/${id}/read`, { method: 'PATCH' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }) });
  const markAllRead = useMutation({ mutationFn: () => api('/api/messages/read-all', { method: 'PATCH' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }) });
  const items = messages.data?.filter((message) => !tab || message.type === tab) ?? [];
  return <>
    <PageHeader title="消息中心" back action={<button type="button" className="text-button" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>{markAllRead.isPending ? '处理中…' : '全部已读'}</button>} />
    <div className="message-tabs">{messageTabs.map((item) => <button key={item.value} type="button" className={tab === item.value ? 'active' : ''} onClick={() => setTab(item.value)}>{item.label}</button>)}</div>
    {messages.isLoading ? <LoadingScreen /> : items.length ? <div className="message-list">{items.map((message) => <button type="button" key={message.id} className={`message-row ${message.isRead ? '' : 'unread'}`} onClick={() => { markRead.mutate(message.id); navigate(message.targetPath.replace('/personal', `/${portal}`)); }}><span className={`message-icon message-icon--${message.type}`}><Bell /></span><div><div><strong>{message.title}</strong><time>{new Date(message.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</time></div><p>{message.content}</p></div>{!message.isRead && <i />}</button>)}</div> : <EmptyState title="暂无消息" detail="新的业务通知会出现在这里" />}
  </>;
}

interface Referral { id: string; name: string; phone: string; projectName: string; jobTitle: string; status: string; reward: number; rewardStatus: string; createdAt: string; onboardDate?: string; retentionDays?: number; eligibleAt?: string; }

export function ReferralPage({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState('');
  const [copied, setCopied] = useState(false);
  const referrals = useQuery({ queryKey: ['referrals'], queryFn: () => api<Referral[]>('/api/referrals') });
  const jobs = useQuery({ queryKey: ['jobs', 'referral'], queryFn: () => api<Job[]>('/api/jobs?status=recruiting') });
  const share = useMutation({ mutationFn: () => api<{ token: string; expiresAt: string }>('/api/referrals/share-token', { method: 'POST', ...jsonBody({ jobDemandId: jobId }) }) });
  const selected = jobs.data?.find((job) => job.id === jobId);
  const link = share.data ? `${location.origin}${import.meta.env.VITE_ROUTER_BASENAME || ''}/personal/jobs/${encodeURIComponent(jobId)}?ref=${encodeURIComponent(share.data.token)}` : '';
  const paid = referrals.data?.filter((item) => item.rewardStatus === 'paid').reduce((sum, item) => sum + item.reward, 0) ?? 0;
  const awaitingPayment = referrals.data?.filter((item) => item.rewardStatus === 'approved').reduce((sum, item) => sum + item.reward, 0) ?? 0;
  return <div className="recruit-referral-page">
    <PageHeader title="推荐有奖" />
    <section className="referral-banner"><div><h1>好工作，分享给工友</h1><p>好友通过你的邀请报名，入职达标后按政策审核奖励。</p><button className="primary-button" type="button" onClick={() => { share.reset(); setCopied(false); setOpen(true); }}>选择岗位，邀请好友</button></div><Gift /></section>
    <div className="referral-stats"><div><strong>{referrals.data?.length ?? 0}</strong><span>已推荐人数</span></div><div><strong>¥{awaitingPayment.toLocaleString()}</strong><span>已批准，待发放</span></div><div><strong>¥{paid.toLocaleString()}</strong><span>已发放奖励</span></div></div>
    <Card className="recruit-rules"><h2>奖励怎么领</h2><ol><li>选择岗位，把专属邀请链接发给好友，由好友自主填写报名资料。</li><li>好友入职并达到该岗位规定的在职天数与其他条件后，工作人员核验并审批。</li><li>审批通过后由财务登记发放凭证；仅奖励直接推荐，重复报名不重复计奖。</li></ol></Card>
    <div className="recruit-result-heading"><h2>我的推荐记录</h2><span>{referrals.data?.length ?? 0} 条</span></div>
    {referrals.isLoading ? <LoadingScreen /> : referrals.error ? <EmptyState title="推荐记录暂时无法读取" detail={referrals.error.message} action={<button className="secondary-button" onClick={() => void referrals.refetch()}>重试</button>} /> : referrals.data?.length ? <div className="referral-list">{referrals.data.map((item) => <Card className="referral-row" key={item.id}><Avatar name={item.name} /><div><div><strong>{item.name}</strong><StatusTag status={item.status} /></div><p>{item.projectName} · {item.jobTitle}</p><p>报名 {item.createdAt.slice(0, 10)} · 入职 {item.onboardDate ?? '等待入职'}</p><div className="referral-reward-progress"><span>{referralRewardLabel(item.rewardStatus)}</span><b>政策奖励 ¥{item.reward.toLocaleString()}</b></div>{item.retentionDays && <p>需在职满 {item.retentionDays} 天{item.eligibleAt ? ` · 预计达标 ${item.eligibleAt.slice(0, 10)}` : ''}</p>}</div></Card>)}</div> : <EmptyState title="还没有推荐记录" detail="先选一个合适的岗位，分享给有需要的工友。" />}
    <Modal open={open} title="邀请好友来报名" onClose={() => { if (!share.isPending) setOpen(false); }} footer={link ? <button className="primary-button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>{copied ? '已复制，去发给好友' : '复制邀请链接'}</button> : <button className="primary-button" disabled={!jobId || share.isPending} onClick={() => share.mutate()}>{share.isPending ? '正在生成…' : '生成专属邀请'}</button>}>
      <div className="form-grid"><Field label="推荐岗位" required><select value={jobId} disabled={share.isPending || Boolean(link)} onChange={(event) => { setJobId(event.target.value); share.reset(); setCopied(false); }}><option value="">请选择好友感兴趣的岗位</option>{jobs.data?.map((job) => <option value={job.id} key={job.id}>{job.region.replace('四川省', '')} · {job.title}</option>)}</select></Field>{selected && <div className="apply-profile"><strong>{selected.projectName}</strong><span className="bluecollar-salary">{jobSalary(selected)}</span><span>{selected.referral_policy || '请先向负责人确认该岗位的推荐政策。'}</span></div>}{link && <><Field label="专属邀请链接"><input readOnly value={link} onFocus={(event) => event.target.select()} /></Field><p className="recruit-safe-note">复制后发给好友；也可以选中链接手动复制。邀请有效期至 {new Date(share.data!.expiresAt).toLocaleString('zh-CN')}。</p></>}{jobs.error && <p className="form-error" role="alert">{jobs.error.message}</p>}{share.error && <p className="form-error" role="alert">{share.error.message}</p>}</div>
    </Modal>
  </div>;
}

const allFunctions = [
  { label: '我的报名', icon: FileText, path: 'applications' }, { label: '面试进度', icon: CalendarClock, path: 'applications' },
  { label: '我的推荐', icon: UsersRound, path: '/personal/referrals' }, { label: '工资条', icon: WalletCards, path: 'payroll', employeeOnly: true },
  { label: '借支申请', icon: CircleDollarSign, path: 'advances', employeeOnly: true }, { label: '申诉记录', icon: ShieldCheck, path: 'appeals' },
  { label: '我的消息', icon: Bell, path: '/personal/messages' }, { label: '收藏岗位', icon: Bookmark, path: 'favorites' }
];

export function PersonalMe({ session }: { session: Session }) {
  const isEmployee = session.personStatus === 'employed';
  const profile = useQuery({ queryKey: ['my-person-profile'], queryFn: () => api<Person[]>('/api/people') });
  const person = profile.data?.find((item) => item.id === session.personId) ?? profile.data?.[0];
  return <>
    <section className="profile-hero"><div className="profile-actions"><Link to="/personal/me/help" aria-label="帮助中心"><Headphones size={19} /></Link><Link to="/personal/me/settings" aria-label="设置"><Settings size={19} /></Link></div><div><Avatar name={session.name} size={62} /><div><h1>{session.name}<StatusTag status={session.personStatus ?? 'registered'} label={isEmployee ? '已入职员工' : '求职者'} /></h1><p>{person?.phone ?? '正在读取人员档案…'}</p></div></div></section>
    <Card className="function-panel"><h2>常用功能</h2><div className="function-grid">{allFunctions.filter((item) => !item.employeeOnly || isEmployee).map((item) => <Link key={item.label} to={item.path.startsWith('/') ? item.path : `/personal/me/${item.path}`}><span><item.icon /></span><strong>{item.label}</strong></Link>)}</div></Card>
    <Card className="menu-list"><h2>其他服务</h2><Link to="profile"><UserRound />个人资料<ChevronRight /></Link><Link to="help"><HelpCircle />帮助中心<ChevronRight /></Link><Link to="help"><Headphones />求职咨询<ChevronRight /></Link><Link to="settings"><Settings />设置<ChevronRight /></Link></Card>
  </>;
}

interface PersonalApplication { id: string; jobId: string; jobTitle: string; projectName: string; status: string; appliedAt: string; interviewAt?: string | null; onboardDate?: string | null; }

export function ApplicationsPage({ session }: { session: Session }) {
  const applications = useQuery({ queryKey: ['my-applications'], queryFn: () => api<PersonalApplication[]>('/api/my-applications') });
  return <><PageHeader title="我的报名" back />{applications.isLoading ? <LoadingScreen /> : applications.error ? <EmptyState title="报名记录暂时没加载出来" detail={applications.error.message} action={<button className="secondary-button" onClick={() => void applications.refetch()}>重新加载</button>} /> : applications.data?.length ? applications.data.map((application) => <Card className="application-card" key={application.id}><div className="row row--between"><div><h2>{application.jobTitle}</h2><p>{application.projectName}</p></div><StatusTag status={application.status} /></div><div className="progress-steps">{['已报名', '已到场', '面试通过', '待入职', '已入职'].map((label, index) => <span className={index <= ['registered', 'arrived', 'interview_passed', 'pending_onboard', 'employed'].indexOf(application.status) ? 'done' : ''} key={label}><i>{index + 1}</i>{label}</span>)}</div><DetailLine label="报名时间" value={new Date(application.appliedAt).toLocaleDateString('zh-CN')} /><DetailLine label="面试时间" value={application.interviewAt ? new Date(application.interviewAt).toLocaleString('zh-CN') : '等待负责人安排'} />{application.onboardDate && <DetailLine label="入职日期" value={application.onboardDate.slice(0, 10)} />}<Link className="secondary-button full-button" to={`/personal/jobs/${application.jobId}`}>查看岗位和联系方式</Link></Card>) : <EmptyState title="还没有报名记录" detail="找到合适岗位后，点“立即报名”即可。" action={<Link className="primary-button" to="/personal/home">去找工作</Link>} />}</>;
}

export function FavoritesPage() {
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const queryClient = useQueryClient();
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api<Job[]>('/api/favorites') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/favorites/${id}`, { method: 'PUT' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }) });
  return <><PageHeader title="收藏岗位" back />{favorites.isLoading ? <LoadingScreen /> : favorites.error ? <EmptyState title="收藏暂时无法读取" detail={favorites.error.message} /> : favorites.data?.length ? <div className="job-list">{favorites.data.map((job) => <div className="favorite-job" key={job.id}><JobCard job={job} onApply={setApplyJob} /><button className="text-button" type="button" disabled={remove.isPending} onClick={() => remove.mutate(job.id)}><Bookmark size={15} />取消收藏</button></div>)}</div> : <EmptyState title="还没有收藏岗位" detail="在岗位详情点击收藏，下次更容易找到。" />}<ApplyDialog job={applyJob} onClose={() => setApplyJob(null)} /></>;
}

interface Payroll { id: string; month: string; gross: number; net: number; details: Record<string, number>; publishedAt: string; }

export function PayrollPage() {
  const payroll = useQuery({ queryKey: ['payroll'], queryFn: () => api<Payroll[]>('/api/payroll') });
  const [selected, setSelected] = useState<Payroll | null>(null);
  return <><PageHeader title="我的工资条" back />{payroll.isLoading ? <LoadingScreen /> : payroll.data?.length ? <div className="stack">{payroll.data.map((item) => <button className="payroll-card" type="button" key={item.id} onClick={() => setSelected(item)}><span>{item.month.replace('-', '年')}月工资条</span><strong>¥ {item.net.toLocaleString()}</strong><small>实发工资 · 点击查看明细</small><ChevronRight /></button>)}</div> : <EmptyState title="暂无工资条" detail="工资条发布后会通过消息通知" />}<Modal open={Boolean(selected)} title={`${selected?.month ?? ''} 工资明细`} onClose={() => setSelected(null)}><div className="payroll-total"><span>实发工资</span><strong>¥{selected?.net.toLocaleString()}</strong></div>{selected && Object.entries(selected.details).map(([label, amount]) => <DetailLine key={label} label={label} value={`${amount >= 0 ? '+' : ''}${amount.toLocaleString()}元`} />)}<Link className="secondary-button full-button" to="/personal/me/appeals" onClick={() => setSelected(null)}>对工资条有疑问？提交申诉</Link></Modal></>;
}

interface Advance { id: string; amount: number; reason: string; status: string; reply?: string; created_at: string; }

export function AdvancesPage() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const advances = useQuery({ queryKey: ['advances'], queryFn: () => api<Advance[]>('/api/advances') });
  const create = useMutation({ mutationFn: (data: { amount: number; reason: string }) => api('/api/advances', { method: 'POST', ...jsonBody(data) }), onSuccess: async () => { setOpen(false); await queryClient.invalidateQueries({ queryKey: ['advances'] }); } });
  return <><PageHeader title="借支申请" back action={<button className="text-button" type="button" onClick={() => setOpen(true)}>新申请</button>} />{advances.data?.length ? <div className="stack">{advances.data.map((item) => <Card className="record-card" key={item.id}><div className="row row--between"><strong>¥{item.amount.toLocaleString()}</strong><StatusTag status={item.status} /></div><p>{item.reason}</p><small>{item.created_at?.slice(0,10)} · {item.reply ?? '等待处理'}</small></Card>)}</div> : <EmptyState title="暂无借支记录" detail="在职员工可在线提交借支申请" action={<button className="primary-button" type="button" onClick={() => setOpen(true)}>提交申请</button>} />}<AdvanceForm open={open} onClose={() => setOpen(false)} onSubmit={(data) => create.mutate(data)} submitting={create.isPending} error={create.error?.message} /></>;
}

function AdvanceForm({ open, onClose, onSubmit, submitting, error }: { open: boolean; onClose: () => void; onSubmit: (data: { amount: number; reason: string }) => void; submitting: boolean; error?: string | undefined }) {
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  return <Modal open={open} title="新建借支申请" onClose={onClose} footer={<button form="advance-form" className="primary-button" type="submit" disabled={submitting}>{submitting ? '提交中…' : '确认提交'}</button>}><form id="advance-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ amount: Number(amount), reason }); }}><Field label="借支金额" required><input required min="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="请输入金额" /></Field><Field label="申请原因" required><textarea required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请说明借支用途" /></Field>{error && <p className="form-error">{error}</p>}</form></Modal>;
}

interface Appeal { id: string; type: string; description: string; requested_amount?: number; status: string; reply?: string; created_at: string; }

export function AppealsPage({ supplier = false }: { supplier?: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const appeals = useQuery({ queryKey: ['appeals'], queryFn: () => api<Appeal[]>('/api/appeals') });
  const create = useMutation({ mutationFn: (data: Record<string, unknown>) => api('/api/appeals', { method: 'POST', ...jsonBody(data) }), onSuccess: async () => { setOpen(false); await queryClient.invalidateQueries({ queryKey: ['appeals'] }); } });
  return <><PageHeader title={supplier ? '我的申诉' : '申诉记录'} back action={<button className="text-button" type="button" onClick={() => setOpen(true)}>新申诉</button>} />{appeals.data?.length ? <div className="stack">{appeals.data.map((item) => <Card className="record-card" key={item.id}><div className="row row--between"><strong>{appealTypeLabel(item.type)}</strong><StatusTag status={item.status} /></div><p>{item.description}</p><small>{item.reply ?? '已提交，等待公司处理'}</small></Card>)}</div> : <EmptyState title="暂无申诉" detail="对工资、状态或结算有疑问时可在线提交" />}<AppealForm supplier={supplier} open={open} onClose={() => setOpen(false)} submitting={create.isPending} error={create.error?.message} onSubmit={(data) => create.mutate(data)} /></>;
}

function appealTypeLabel(type: string) { return ({ salary: '工资申诉', person_status: '人员状态申诉', settlement_missing: '人员遗漏', settlement_days: '在职天数错误', settlement_policy: '政策使用错误', settlement_amount: '结算金额错误', other: '其他申诉' } as Record<string,string>)[type] ?? type; }

function AppealForm({ supplier, open, onClose, onSubmit, submitting, error }: { supplier: boolean; open: boolean; onClose: () => void; onSubmit: (data: Record<string, unknown>) => void; submitting: boolean; error?: string | undefined }) {
  const [type, setType] = useState(supplier ? 'settlement_amount' : 'salary'); const [description, setDescription] = useState(''); const [amount, setAmount] = useState('');
  const [attachments, setAttachments] = useState<Array<{ id: string; originalName: string }>>([]);
  const upload = useMutation({ mutationFn: async (file: File) => { const body = new FormData(); body.append('file', file); return api<{ id: string; originalName: string }>('/api/attachments', { method: 'POST', body }); } });
  const addFiles = async (files: FileList | null) => { for (const file of Array.from(files ?? []).slice(0, 5 - attachments.length)) { const saved = await upload.mutateAsync(file); setAttachments((current) => [...current, saved]); } };
  return <Modal open={open} title="提交申诉" onClose={onClose} footer={<button form="appeal-form" className="primary-button" type="submit" disabled={submitting || upload.isPending}>{submitting ? '提交中…' : upload.isPending ? '上传中…' : '提交申诉'}</button>}><form id="appeal-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ type, description, requestedAmount: amount ? Number(amount) : undefined, attachmentIds: attachments.map((item) => item.id) }); }}><Field label="申诉类型" required><select value={type} onChange={(event) => setType(event.target.value)}>{supplier ? <><option value="settlement_missing">人员遗漏</option><option value="settlement_days">在职天数错误</option><option value="settlement_policy">政策使用错误</option><option value="settlement_amount">结算金额错误</option><option value="other">其他</option></> : <><option value="salary">工资申诉</option><option value="other">其他</option></>}</select></Field><Field label="问题说明" required><textarea required minLength={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="请描述问题、正确情况与期望处理结果" /></Field><Field label="申诉金额"><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="如涉及金额可填写" /></Field><label className="upload-placeholder"><FileText /><span>{upload.isPending ? '正在上传…' : '上传凭证（可选）'}</span><small>支持图片或 PDF，最多5个文件</small><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void addFiles(event.target.files)} /></label>{attachments.length > 0 && <ul className="attachment-list">{attachments.map((item) => <li key={item.id}><FileText size={14} />{item.originalName}<button type="button" onClick={() => setAttachments((current) => current.filter((file) => file.id !== item.id))}>移除</button></li>)}</ul>}{(error || upload.error) && <p className="form-error">{error ?? upload.error?.message}</p>}</form></Modal>;
}

export function GenericPersonalPage({ title }: { title: string }) {
  const { page = '' } = useParams();
  const profile = useQuery({ queryKey: ['my-person-profile'], queryFn: () => api<Person[]>('/api/people') });
  const person = profile.data?.[0];
  const pageTitle = ({ profile: '个人资料', help: '帮助中心', settings: '设置' } as Record<string, string>)[page] ?? title;
  const details: Array<[string, string]> = page === 'profile'
    ? [['姓名', person?.name ?? '正在读取'], ['手机号', person?.phone ?? '正在读取'], ['身份证号', person?.idCard ?? '正在读取'], ['员工编号', person?.employeeNo ?? '未生成'], ['当前项目', person?.projectName ?? '正在读取'], ['岗位', person?.jobTitle ?? '正在读取']]
    : page === 'settings'
      ? [['消息通知', '已开启'], ['信息展示', '权限范围内展示完整业务信息'], ['数据同步', '后台、小程序与AI助手实时联动'], ['当前版本', '好工到 · HRMS 招聘模块']]
      : [['招聘咨询', '在岗位详情查看负责人联系方式'], ['申诉处理', '提交后可在申诉记录查看进度'], ['数据说明', '仅展示当前账号权限范围内的业务数据']];
  return <><PageHeader title={pageTitle} back /><Card className="detail-section">{details.map(([label, value]) => <DetailLine key={label} label={label} value={value} />)}</Card>{page === 'help' && <Link className="primary-button full-button" to="/personal/home"><BriefcaseBusiness size={18} />查看岗位联系方式</Link>}</>;
}
