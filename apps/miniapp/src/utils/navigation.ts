import Taro from "@tarojs/taro";
import { safeLoginReturnTo } from "../domain/links";

export function currentPagePath(): string | undefined {
  const router = Taro.getCurrentInstance().router;
  if (!router?.path) return undefined;
  const path = router.path.startsWith("/") ? router.path : `/${router.path}`;
  const query = Object.entries(router.params ?? {})
    .filter(([key, value]) => !key.startsWith("__") && typeof value === "string")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
    .join("&");
  return safeLoginReturnTo(`${path}${query ? `?${query}` : ""}`);
}

export async function backOrHome(fallback = "/pages/index/index"): Promise<void> {
  if (Taro.getCurrentPages().length > 1) {
    try { await Taro.navigateBack(); return; } catch { /* 单页分享落地或页面栈已变化时回到明确入口。 */ }
  }
  await Taro.reLaunch({ url: safeLoginReturnTo(fallback) ?? "/pages/index/index" });
}
