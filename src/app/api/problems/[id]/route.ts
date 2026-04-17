import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit } from "@/lib/subscription";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const DETAIL_RATE_LIMIT = { name: "problems_detail", windowMs: 60_000, maxRequests: 60 };

async function handleVariantGet(userId: number, variantId: number, isAdmin: boolean): Promise<Response> {
  if (isNaN(variantId)) return Response.json({ error: "无效变形题 ID" }, { status: 404 });

  const full = await prisma.variantProblem.findUnique({
    where: { id: variantId },
    select: {
      id: true, sourceId: true, title: true, level: true, tags: true,
      description: true, inputFormat: true, outputFormat: true, samples: true,
      genStatus: true,
    },
  });

  if (!full || full.genStatus !== "ready") {
    return Response.json({ error: "变形题不存在" }, { status: 404 });
  }

  const variant = full;

  // 管理员跳过解锁检查
  if (!isAdmin) {
    const readyVariants = await prisma.variantProblem.findMany({
      where: { sourceId: full.sourceId, genStatus: "ready" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const idx   = readyVariants.findIndex((v) => v.id === variantId);
    const batch = idx < 2 ? 1 : 2;

    const unlock = await prisma.variantUnlock.findUnique({
      where: { userId_problemId_batch: { userId, problemId: full.sourceId, batch } },
    });

    if (!unlock) return Response.json({ error: "变形题不存在" }, { status: 404 });
  }

  // 获取源题 luoguId 供前端显示
  const source = await prisma.problem.findUnique({
    where: { id: full.sourceId },
    select: { luoguId: true },
  });

  return Response.json({ ...variant, isVariant: true, sourceLuoguId: source?.luoguId ?? "" });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const userRl = checkRateLimit(DETAIL_RATE_LIMIT, `user_${user.userId}`);
  const ipRl = checkRateLimit(DETAIL_RATE_LIMIT, `ip_${getClientIp(request)}`);
  if (!userRl.allowed || !ipRl.allowed) {
    const retryAfterMs = Math.max(userRl.retryAfterMs, ipRl.retryAfterMs);
    return Response.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  try {
    const { id } = await params;

    // id 以 "v" 开头表示变形题，如 "v42"
    if (id.startsWith("v")) {
      return handleVariantGet(user.userId, parseInt(id.slice(1)), user.role === "admin");
    }

    const problemId = parseInt(id);

    const allowed = await checkFreeLimit(user.userId, problemId);
    if (!allowed) {
      return Response.json(
        { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
        { status: 403 }
      );
    }

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        luoguId: true,
        title: true,
        level: true,
        tags: true,
        description: true,
        inputFormat: true,
        outputFormat: true,
        samples: true,
        // 不返回 testCases
      },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    return Response.json({ ...problem, isVariant: false });
  } catch {
    return Response.json({ error: "获取题目失败" }, { status: 500 });
  }
}
