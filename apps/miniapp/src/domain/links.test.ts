import { describe, expect, it } from "vitest";
import { afterLoginPath, applicationFormPath, jobDetailPath, loginPath, referralTokenFromParams, safeLoginReturnTo } from "./links";
import type { SessionUser } from "../api/types";

const employee: SessionUser = { id: "worker-a", username: "worker", displayName: "工友", role: "EMPLOYEE", personId: "person-a", branchId: null, supplierId: null, employeeType: null, projectIds: [], permissions: ["job:read", "application:create", "referral:create"] };

describe("推荐分享链接", () => {
  it("优先读取显式 ref 并解析微信二维码 scene", () => {
    expect(referralTokenFromParams({ ref: "signed-token", scene: "r=ignored" })).toBe("signed-token");
    expect(referralTokenFromParams({ scene: encodeURIComponent("r=scene-token") })).toBe("scene-token");
  });

  it("生成可直接进入岗位详情并保留推荐签名的页面路径", () => {
    expect(jobDetailPath("job/id", "signed token")).toBe(
      "/pages/jobs/detail/index?id=job%2Fid&ref=signed%20token"
    );
  });
});

describe("登录续办与权限入口", () => {
  it("登录往返保留岗位、签名推荐token和明确的推荐操作", () => {
    const target = applicationFormPath("job/id", "signed token", "referral");
    const encodedReturn = loginPath(target).split("returnTo=")[1];
    expect(safeLoginReturnTo(encodedReturn)).toBe(target);
    expect(afterLoginPath(safeLoginReturnTo(encodedReturn), employee)).toBe(target);
  });

  it("默认岗位报名不带推荐他人action", () => {
    expect(applicationFormPath("job-a", "token-a")).toBe("/pages/application/form/index?jobId=job-a&ref=token-a");
  });

  it("拒绝站外、未知和登录循环页面", () => {
    for (const path of ["https://evil.example", "/pages/unknown/index", "/pages/login/index", "/pages/demo/index", "/pages/jobs/detail/index?id=a#fragment"]) {
      expect(safeLoginReturnTo(path)).toBeUndefined();
    }
  });

  it("员工与外包员工可回到本人报名，不能误进运营供应商页", () => {
    expect(afterLoginPath("/pages/application/mine/index", employee)).toBe("/pages/application/mine/index");
    expect(afterLoginPath("/pages/application/mine/index", { ...employee, role: "OUTSOURCED_EMPLOYEE" })).toBe("/pages/application/mine/index");
    expect(afterLoginPath("/pages/operator/people/index", employee)).toBe("/pages/index/index");
    expect(afterLoginPath("/pages/supplier/people/index", employee)).toBe("/pages/index/index");
    expect(afterLoginPath("/pages/referrals/mine/index", { ...employee, role: "JOB_SEEKER" })).toBe("/pages/index/index");
  });
});
