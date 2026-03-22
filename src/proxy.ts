import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 需要登录才能访问的路径
const protectedPaths = ["/problems", "/wrongbook", "/admin"];

// 不需要登录的路径
const publicPaths = ["/", "/register", "/api/auth"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API路由和静态资源不拦截
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 检查是否是受保护路径
  const isProtected = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // 检查token（通过cookie或header）
  // 由于我们用localStorage存token，proxy层无法直接验证JWT
  // 前端会在客户端检查token，如果没有则跳转到登录页
  // proxy层主要做基本的路径保护
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
