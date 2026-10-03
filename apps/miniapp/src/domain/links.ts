import type { SessionUser } from "../api/types";
import { isEmployeeRole, isOperatorRole, isSupplierRole } from "./roles";

export function referralTokenFromParams(params: { ref?: string; scene?: string }): string | undefined {
  if (params.ref?.trim()) return params.ref.trim();
  if (!params.scene) return undefined;
  let scene = params.scene;
  try {
    scene = decodeURIComponent(scene);
  } catch {
    return undefined;
  }
  const token = /(?:^|&)r=([^&]+)/.exec(scene)?.[1];
  return token?.trim() || undefined;
}

export function jobDetailPath(jobDemandId: string, referralToken?: string): string {
  const ref = referralToken ? `&ref=${encodeURIComponent(referralToken)}` : "";
  return `/pages/jobs/detail/index?id=${encodeURIComponent(jobDemandId)}${ref}`;
}

export function applicationFormPath(jobDemandId?: string, referralToken?: string, action?: "referral"): string {
  const query = [jobDemandId ? `jobId=${encodeURIComponent(jobDemandId)}` : "", referralToken ? `ref=${encodeURIComponent(referralToken)}` : "", action ? `action=${action}` : ""].filter(Boolean).join("&");
  return `/pages/application/form/index${query ? `?${query}` : ""}`;
}

const allowedReturnPage = /^\/pages\/(?:index\/index|jobs\/(?:index|detail)\/index|application\/(?:form|mine)\/index|profile\/index\/index|referrals\/(?:index|mine|rewards)\/index|salary\/index\/index|operator\/(?:register|interviews|onboarding|offboarding|people|person-detail)\/index|supplier\/(?:people|metrics|policies)\/index|policy\/index)(?:\?[^#\u0000-\u001f]*)?$/;

export function safeLoginReturnTo(value?: string): string | undefined {
  if (!value) return undefined;
  let path = value;
  if (!path.startsWith("/")) {
    try { path = decodeURIComponent(path); } catch { return undefined; }
  }
  return allowedReturnPage.test(path) ? path : undefined;
}

export function loginPath(returnTo?: string): string {
  const path = safeLoginReturnTo(returnTo);
  return `/pages/login/index${path ? `?returnTo=${encodeURIComponent(path)}` : ""}`;
}

export function afterLoginPath(returnTo: string | undefined, user: SessionUser): string {
  const path = safeLoginReturnTo(returnTo);
  if (!path) return "/pages/index/index";
  const page = path.split("?")[0] ?? "";
  if (page.startsWith("/pages/operator/") && (!isOperatorRole(user.role) || (!user.permissions.includes("people:read") && !user.permissions.includes("people:write")))) return "/pages/index/index";
  if (page.startsWith("/pages/supplier/") && !isSupplierRole(user.role)) return "/pages/index/index";
  if (page.startsWith("/pages/referrals/") && page !== "/pages/referrals/index/index" && (!isEmployeeRole(user.role) || !user.permissions.includes("referral:create"))) return "/pages/index/index";
  if (page === "/pages/application/mine/index" && user.role !== "JOB_SEEKER" && !isEmployeeRole(user.role)) return "/pages/index/index";
  if (page === "/pages/application/form/index" && !user.permissions.includes("application:create") && !user.permissions.includes("referral:create") && !(isOperatorRole(user.role) && user.permissions.includes("people:write"))) return "/pages/index/index";
  if (page === "/pages/salary/index/index" && (!isEmployeeRole(user.role) || !user.permissions.includes("salary:self-read"))) return "/pages/index/index";
  if (page.startsWith("/pages/jobs/") && !user.permissions.includes("job:read")) return "/pages/index/index";
  return path;
}
