import { describe, expect, it } from "vitest";
import { UserRole } from "@xiangneng/shared";
import { policyAmount, portalRole } from "../src/portal/mappers.js";

describe("门户身份映射", () => {
  it("奖励文本中的满期天数不能误解析为奖励金额", () => {
    expect(policyAmount("入职满30天，奖励600元")).toBe(600);
    expect(policyAmount("在岗满45天，返费1,200元/人")).toBe(1200);
    expect(policyAmount("入职满30天后审核，金额另行约定")).toBe(0);
    expect(policyAmount("奖励条件：在岗满30天，300元/人")).toBe(300);
    expect(policyAmount("600")).toBe(600);
  });
  it("供应商管理员进入供应商端而不是个人端", () => {
    expect(portalRole(UserRole.SUPPLIER)).toBe("supplier");
    expect(portalRole(UserRole.SUPPLIER_ADMIN)).toBe("supplier");
  });
});
