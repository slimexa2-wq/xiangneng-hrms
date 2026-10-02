import type { Job } from './types';
import { formatSalaryRange } from './format';

export const recruitmentCities = [
  { label: '四川全省', value: '' },
  { label: '成都', value: '四川省成都市' },
  { label: '宜宾', value: '四川省宜宾市' },
  { label: '绵阳', value: '四川省绵阳市' }
];

export function jobBenefits(job: Pick<Job, 'benefits'>): string[] {
  return [...new Set((job.benefits || '').split(/[、,，;；\n]+/).map((item) => item.trim()).filter(Boolean))];
}

export function jobSalary(job: Pick<Job, 'salary_min' | 'salary_max' | 'salaryText'>): string {
  return job.salaryText?.trim() || formatSalaryRange(job.salary_min, job.salary_max, false);
}

export function isRecruiting(job: Pick<Job, 'status'>): boolean {
  return job.status === 'recruiting';
}

export function hasJobPreference(job: Pick<Job, 'benefits' | 'work_time'>, preference: string): boolean {
  const text = `${job.benefits || ''}、${job.work_time || ''}`;
  if (new RegExp(`(?:不|无|非)${preference}`).test(text)) return false;
  return text.includes(preference);
}

export function referralRewardLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '在职条件待确认', earned: '已达标，待审批', approved: '审批通过，待发放',
    paid: '已发放', cancelled: '已取消'
  };
  return labels[status] ?? '等待核实';
}
