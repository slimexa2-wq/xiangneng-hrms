import { BriefcaseBusiness, CalendarDays, ChevronRight, Clock3, MapPin, Phone, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Job, Person } from '../app/types';
import { formatSalaryRange } from '../app/format';
import { isRecruiting, jobBenefits, jobSalary } from '../app/recruitment';
import { Avatar } from './Avatar';
import { StatusTag } from './StatusTag';

export function SalaryLabel({ job }: { job: Pick<Job, 'salary_min' | 'salary_max' | 'salaryText'> }) {
  const salary = jobSalary(job);
  const parts = salary.match(/^([\d,]+(?:\s*[-–—~至]\s*[\d,]+)?)(元\s*[/／]\s*(?:月|小时|天|日|周))$/);
  return <strong className="bluecollar-salary">{parts ? <><span>{parts[1]}</span><span className="salary-unit">{parts[2]}</span></> : salary}</strong>;
}

export function JobCard({ job, portal = 'personal', onApply }: { job: Job; portal?: 'personal' | 'supplier' | 'internal'; onApply?: (job: Job) => void }) {
  const detailPath = portal === 'supplier' ? `/supplier/jobs/${job.id}` : portal === 'internal' ? `/internal/projects/jobs/${job.id}` : `/personal/jobs/${job.id}`;
  const gap = Math.max(0, job.headcount - Number(job.appliedCount));
  if (portal === 'personal') return <article className="job-card job-card--personal bluecollar-job">
    <div className="job-main">
      <div className="bluecollar-job-heading"><Link to={detailPath}><h3>{job.title}</h3></Link><StatusTag status={job.status} /></div>
      <SalaryLabel job={job} />
      <p className="bluecollar-company">{job.projectName}</p>
      <div className="job-meta"><span><MapPin />{job.region.replace('四川省', '') || '地点待确认'}</span><span><Clock3 />{job.work_time || '班次待确认'}</span></div>
      <div className="bluecollar-benefits">{jobBenefits(job).slice(0, 3).map((benefit) => <span key={benefit}>{benefit}</span>)}</div>
      <div className="bluecollar-job-footer"><span>招聘 {job.headcount} 人</span><div><Link className="job-detail-link" to={detailPath}>了解详情</Link>{onApply && <button className="primary-button" type="button" disabled={!isRecruiting(job)} onClick={() => onApply(job)}>{isRecruiting(job) ? '立即报名' : '暂停报名'}</button>}</div></div>
    </div>
  </article>;
  return <article className={`job-card job-card--${portal}`}>
    <div className={`job-thumb job-thumb--${job.imageKey}`} style={job.imageUrl ? { backgroundImage: `linear-gradient(180deg, rgba(8,35,76,.04), rgba(8,35,76,.68)), url(${job.imageUrl})` } : undefined}><BriefcaseBusiness /><span>{job.projectName}</span></div>
    <div className="job-main">
      <div className="job-title-row"><div><h3>{job.title}</h3><p>{job.projectName}</p></div><div><strong>{formatSalaryRange(job.salary_min, job.salary_max)}</strong><StatusTag status={job.status} /></div></div>
      <div className="job-meta"><span><MapPin />{job.region.replace('四川省', '')}</span><span><Clock3 />{job.work_time.split(' ')[0]}</span><span><UsersRound />招聘 {job.headcount} 人</span></div>
      {portal === 'supplier' && <dl className="compact-grid"><div><dt>已报名</dt><dd>{job.appliedCount}人</dd></div><div><dt>剩余缺口</dt><dd>{gap}人</dd></div><div><dt>截止时间</dt><dd>{job.deadline}</dd></div></dl>}
      {portal === 'supplier' && <p className="job-policy">适用政策：{job.supplier_policy}</p>}
      <div className="job-actions"><Link className="secondary-button" to={detailPath}>查看详情</Link>{portal === 'supplier' ? <Link className="primary-button" to={`/supplier/people?jobId=${job.id}`}>报名人员</Link> : portal !== 'internal' && onApply && <button className="primary-button" type="button" onClick={() => onApply(job)}>立即报名</button>}</div>
    </div>
  </article>;
}

export function PersonRow({ person, portal = 'internal' }: { person: Person; portal?: 'internal' | 'supplier' }) {
  const path = portal === 'supplier' ? `/supplier/people/${person.id}` : `/internal/people/${person.id}`;
  return <Link to={path} className="person-row">
    <Avatar name={person.name} size={44} />
    <div className="person-row-main"><div><strong>{person.name}</strong><span>{person.phone}</span><StatusTag status={person.status} /></div><p>{person.projectName}<i />{person.jobTitle}<i />{person.supplierName ?? person.recommenderName ?? '祥能自招'}</p><p><CalendarDays /> 面试时间：{person.interviewAt ? new Date(person.interviewAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂未安排'}</p></div>
    <ChevronRight size={17} className="row-chevron" />
  </Link>;
}

export function DetailLine({ icon, label, value, action }: { icon?: 'map' | 'time' | 'phone' | 'users'; label: string; value: React.ReactNode; action?: React.ReactNode }) {
  const Icon = icon === 'map' ? MapPin : icon === 'time' ? Clock3 : icon === 'phone' ? Phone : UsersRound;
  return <div className="detail-line"><Icon size={17} /><span>{label}</span><strong>{value}</strong>{action}</div>;
}
