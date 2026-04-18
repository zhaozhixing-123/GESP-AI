"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

/**
 * 全局 page_view 埋点。挂在 ClientLayout，监听 pathname 变化统一打点。
 *
 * 为什么不放在各 page：登录页/注册页/支付页/做题页都有匿名访客入口，单页埋点
 * 会漏掉转跳路径（比如直接从分享链接进 /register 不经过 /）。放这里保证所有
 * 路由都被覆盖，包括登录后的页面（UV 在漏斗中算独立访客，不区分登录态）。
 *
 * 以下路径排除：API、管理员后台、内部工具，降噪。
 */

const EXCLUDE_PREFIXES = ["/api", "/admin"];

export default function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (EXCLUDE_PREFIXES.some((p) => pathname.startsWith(p))) return;
    trackEvent("page_view", { path: pathname });
  }, [pathname]);

  return null;
}
