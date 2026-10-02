import { describe, expect, it } from 'vitest';
import { hasJobPreference, jobBenefits, jobSalary, referralRewardLabel } from './recruitment';

describe('求职信息显示', () => {
  it('保留小时工工资单位，不换算为月薪', () => {
    expect(jobSalary({ salaryText: '25元/小时，按实际工时结算', salary_min: 25, salary_max: 25 })).toBe('25元/小时，按实际工时结算');
  });
  it('空福利不补包住，已有福利去重', () => {
    expect(jobBenefits({ benefits: '' })).toEqual([]);
    expect(jobBenefits({ benefits: '工作餐、包住、工作餐' })).toEqual(['工作餐', '包住']);
  });
  it('批准、达标与已发放分别展示', () => {
    expect(referralRewardLabel('earned')).toBe('已达标，待审批');
    expect(referralRewardLabel('approved')).toBe('审批通过，待发放');
    expect(referralRewardLabel('paid')).toBe('已发放');
  });
  it('福利筛选排除明确不包住的岗位', () => {
    expect(hasJobPreference({ benefits: '包吃，不包住', work_time: '两班倒' }, '包住')).toBe(false);
    expect(hasJobPreference({ benefits: '包吃、包住', work_time: '长白班' }, '包住')).toBe(true);
  });
});
