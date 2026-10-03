import { describe, expect, it } from "vitest";
import type { JobDemand } from "../api/types";
import { applicationProgressStatus, jobCategory, matchesJobBenefit, matchesRecruitmentFilters, remainingJobs, rewardCondition } from "./recruitment";

const job: JobDemand = { id: "job-id", title: "仓库分拣员", projectId: "project-id", requiredCount: 10, salary: "6000-7000元/月", workTime: "两班倒", workLocation: "四川成都新都区", deadline: "2030-01-01", status: "RECRUITING", requirements: "以公示要求为准" };

describe("candidate recruitment filters", () => {
  it("supports legacy location and job title while combining filters", () => {
    expect(jobCategory(job)).toBe("仓储物流");
    expect(matchesRecruitmentFilters(job, "成都", "仓储物流", "分拣")).toBe(true);
    expect(matchesRecruitmentFilters(job, "宜宾", "仓储物流", "")).toBe(false);
    expect(matchesRecruitmentFilters(job, "成都", "普工", "")).toBe(false);
  });
  it("prefers explicit city and category fields over legacy text", () => {
    const structured = { ...job, city: "宜宾", category: "生产制造" };
    expect(matchesRecruitmentFilters(structured, "宜宾", "普工", "")).toBe(true);
    expect(matchesRecruitmentFilters(structured, "成都", "普工", "")).toBe(false);
  });
  it("excludes paused jobs and supports project search", () => {
    expect(matchesRecruitmentFilters({ ...job, status: "PAUSED" }, "全部城市", "全部工种", "")).toBe(false);
    expect(matchesRecruitmentFilters({ ...job, projectName: "测试物流项目" }, "全部城市", "全部工种", "物流项目")).toBe(true);
  });
  it("does not create reward terms and clamps exhausted headcount", () => {
    expect(rewardCondition(job)).toBe("");
    expect(remainingJobs({ ...job, onboardedCount: 12 })).toBe(0);
    expect(rewardCondition({ ...job, referralOffer: { amount: "600", retentionDays: 30, achievementConditions: "需满足政策条件", exclusionConditions: null, employeeType: "普通员工" } })).toContain("30 天");
  });
  it("shows the specific application progress before current person status", () => {
    expect(applicationProgressStatus({ id: "application-id", employmentStatus: "APPLICANT", interviewStatus: "FAILED", person: { id: "person-id", name: "测试人员", phone: "", employmentStatus: "ACTIVE" } })).toBe("FAILED");
    expect(applicationProgressStatus({ id: "application-id", employmentStatus: "LEFT", interviewStatus: "PASSED" })).toBe("LEFT");
  });
  it("filters actual benefits and shift information without inventing conditions", () => {
    expect(matchesJobBenefit({ benefits: ["包吃", "包住"], workTime: "长白班 08:00–17:00" }, "长白班")).toBe(true);
    expect(matchesJobBenefit({ benefits: [], workTime: "两班倒" }, "包住")).toBe(false);
    expect(matchesJobBenefit({ benefits: ["不包吃", "包住"], workTime: "非长白班" }, "包吃")).toBe(false);
    expect(matchesJobBenefit({ benefits: [], workTime: "非长白班" }, "长白班")).toBe(false);
  });
});
