/** Public promise only: no policy IDs, supplier prices or internal notes. */
export function publicReferralOffer(value: unknown, now = new Date()) {
  if (!value || typeof value !== "object") return null;
  const policy = value as Record<string, unknown>;
  if (!policy.isActive || policy.type !== "EMPLOYEE_REFERRAL") return null;
  if (!(policy.effectiveAt instanceof Date) || policy.effectiveAt > now) return null;
  if (policy.expiresAt instanceof Date && policy.expiresAt.getTime() + 86_400_000 <= now.getTime()) return null;
  return {
    amount: String(policy.amount ?? "0"),
    retentionDays: Number(policy.retentionDays ?? 30),
    achievementConditions: String(policy.achievementConditions ?? ""),
    exclusionConditions: typeof policy.exclusionConditions === "string" ? policy.exclusionConditions : null,
    employeeType: typeof policy.employeeType === "string" ? policy.employeeType : null
  };
}

/** Match plain-language categories against existing, unstructured HRMS jobs. */
export function jobCategoryTerms(category: string): string[] {
  const aliases: Record<string, string[]> = {
    操作工: ["操作", "普工", "生产", "制造"],
    工厂普工: ["操作", "普工", "生产", "制造"],
    生产制造: ["操作", "普工", "生产", "制造"],
    仓储: ["仓储", "物流", "仓库", "配送", "装卸"],
    仓储物流: ["仓储", "物流", "仓库", "配送", "装卸"],
    质检: ["质检", "检验", "包装"],
    质检包装: ["质检", "检验", "包装"],
    技术岗: ["技术", "技工", "焊工", "电工", "叉车"],
    技能岗位: ["技术", "技工", "焊工", "电工", "叉车"]
  };
  return [...new Set([category, ...(aliases[category] ?? [])])];
}
