import type { Application, JobDemand } from "../api/types";

export const recruitmentCities = ["全部城市", "成都", "宜宾", "绵阳"];
export const recruitmentCategories = ["全部工种", "普工", "仓储物流", "技能工", "司机配送"];

/** 兼容尚未补充结构化工种的已有岗位，只按岗位名称分类。 */
export function jobCategory(job: Pick<JobDemand, "title" | "category">): string {
  const text = job.category?.trim() || job.title;
  if (/司机|配送|驾驶/.test(text)) return "司机配送";
  if (/仓储|仓库|分拣|搬运|物流|拣货|装卸/.test(text)) return "仓储物流";
  if (/焊工|电工|维修|叉车|钳工|技工|技能|技术/.test(text)) return "技能工";
  if (/普工|操作|生产|制造|包装|质检|组装/.test(text)) return "普工";
  return job.category?.trim() || "其他岗位";
}

export function matchesRecruitmentFilters(job: JobDemand, city: string, category: string, keyword: string): boolean {
  if (job.status !== "RECRUITING") return false;
  if (city !== recruitmentCities[0] && !(job.city?.trim() || job.workLocation).includes(city)) return false;
  if (category !== recruitmentCategories[0] && jobCategory(job) !== category) return false;
  const term = keyword.trim().toLowerCase();
  return !term || [job.title, job.project?.name, job.projectName, job.workLocation, job.category]
    .some((value) => value?.toLowerCase().includes(term));
}

export function remainingJobs(job: JobDemand): number {
  return Math.max(0, job.remainingCount ?? job.progress?.remainingGap ?? job.requiredCount - (job.onboardedCount ?? 0));
}

export function matchesJobBenefit(job: Pick<JobDemand, "benefits" | "workTime">, benefit: string): boolean {
  if (!benefit) return true;
  const text = `${(job.benefits ?? []).join("、")}、${job.workTime ?? ""}`;
  return !new RegExp(`(?:不|无|非)${benefit}`).test(text) && text.includes(benefit);
}

export function rewardCondition(job: JobDemand): string {
  const offer = job.referralOffer;
  if (!offer) return "";
  return offer.retentionDays > 0 ? `好友入职满 ${offer.retentionDays} 天，满足政策后审核发放` : "满足岗位政策条件后审核发放";
}

/** 每一次报名的生命周期优先，避免跨项目复用人员主档时显示其他岗位的进度。 */
export function applicationProgressStatus(application: Application): string | undefined {
  if (application.employmentStatus === "ACTIVE" || application.employmentStatus === "LEFT" || application.employmentStatus === "PENDING_ONBOARD") return application.employmentStatus;
  if (application.interviewStatus) return application.interviewStatus;
  return application.employmentStatus ?? application.status ?? application.person?.employmentStatus ?? application.person?.status ?? undefined;
}
