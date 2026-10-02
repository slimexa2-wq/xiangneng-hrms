import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { getSessionUser, subscribeSession } from "../auth/session";
import type { SessionUser } from "../api/types";
import { loginPath } from "../domain/links";
import { currentPagePath } from "../utils/navigation";

export function useSession(requireLogin = true): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const active = useRef(false);
  const redirecting = useRef(false);
  const sync = () => {
    const current = getSessionUser();
    setUser(current);
    if (current) redirecting.current = false;
    if (requireLogin && !current && active.current && !redirecting.current) {
      redirecting.current = true;
      void Taro.reLaunch({ url: loginPath(currentPagePath()) });
    }
  };
  useEffect(() => subscribeSession(sync), [requireLogin]);
  useDidShow(() => {
    active.current = true;
    sync();
  });
  useDidHide(() => { active.current = false; });
  return user;
}
