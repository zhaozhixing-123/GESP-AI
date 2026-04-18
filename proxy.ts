import { NextRequest, NextResponse } from "next/server";

/**
 * CSP with per-request nonce (C1 修复)。
 * - script-src：nonce + strict-dynamic，去掉 'unsafe-inline'，阻断 XSS 注入脚本
 * - style-src：保留 'unsafe-inline'（应用大量使用 style={{...}} 内联属性；nonce 不作用于 style="..." 属性）
 * - connect-src：保留 https://api.anthropic.com（前端直连 Claude API）
 * - 额外允许 fonts.googleapis.com / fonts.gstatic.com（落地页 Noto 字体）
 *
 * 使用 nonce 会强制所有匹配的页面走动态渲染，无法被 CDN 缓存。
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: https:;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' https://api.anthropic.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
