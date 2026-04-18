import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeToken, getTokenFromRequest } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

/**
 * 埋点事件上报。fire-and-forget：前端不等响应，后端也不做昂贵校验。
 *
 * 认证可选——访客 page_view 是 UV 漏斗第一层的唯一数据源，必须接受未登录。
 * 有 Bearer token 就顺便记 userId，用于登录前后路径串联；token 异常静默丢弃，不影响主流程。
 */

const ALLOWED_TYPES = new Set([
  "page_view",
  "problem_open",
  "signup_submit",
  "pay_success_client",
]);

// 按 anonymousId 限流，防埋点接口被刷爆库
const TRACK_RATE_LIMIT = { name: "track_event", windowMs: 60_000, maxRequests: 120 };
// IP 兜底限流，防同一攻击者换 anonymousId 继续刷
const TRACK_IP_LIMIT = { name: "track_event_ip", windowMs: 60_000, maxRequests: 300 };

const MAX_PATH_LEN = 512;
const MAX_METADATA_LEN = 2048;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipRl = checkRateLimit(TRACK_IP_LIMIT, ip);
    if (!ipRl.allowed) {
      return new Response(null, { status: 204 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(null, { status: 204 });
    }

    const { type, anonymousId, path, problemId, metadata } = body as {
      type?: unknown;
      anonymousId?: unknown;
      path?: unknown;
      problemId?: unknown;
      metadata?: unknown;
    };

    if (typeof type !== "string" || !ALLOWED_TYPES.has(type)) {
      return new Response(null, { status: 204 });
    }
    if (typeof anonymousId !== "string" || anonymousId.length === 0 || anonymousId.length > 64) {
      return new Response(null, { status: 204 });
    }

    const anonRl = checkRateLimit(TRACK_RATE_LIMIT, anonymousId);
    if (!anonRl.allowed) {
      return new Response(null, { status: 204 });
    }

    // 可选登录：解析成功就带上 userId，失败忽略
    let userId: number | null = null;
    const token = getTokenFromRequest(request);
    if (token) {
      const payload = decodeToken(token);
      if (payload) userId = payload.userId;
    }

    const safePath =
      typeof path === "string" && path.length > 0 && path.length <= MAX_PATH_LEN ? path : null;

    const safeProblemId =
      typeof problemId === "number" && Number.isFinite(problemId) && problemId > 0
        ? Math.floor(problemId)
        : null;

    let safeMetadata: string | null = null;
    if (metadata !== undefined && metadata !== null) {
      try {
        const s = JSON.stringify(metadata);
        if (s.length <= MAX_METADATA_LEN) safeMetadata = s;
      } catch {
        // 不可序列化就丢弃
      }
    }

    await prisma.event.create({
      data: {
        type,
        userId,
        anonymousId,
        path: safePath,
        problemId: safeProblemId,
        metadata: safeMetadata,
      },
    });

    return new Response(null, { status: 204 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[Track]", msg);
    // 埋点失败不能影响用户，永远返回 204
    return new Response(null, { status: 204 });
  }
}
