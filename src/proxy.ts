import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const GLOBAL_API_RATE_LIMIT = { name: "api_global", windowMs: 60_000, maxRequests: 120 };

export function proxy(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(GLOBAL_API_RATE_LIMIT, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
