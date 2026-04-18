import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { getSubscriptionInfo } from "@/lib/subscription";
import { streamWrongCodeAnalysis } from "@/lib/aiteacher";
import { checkRateLimit } from "@/lib/ratelimit";

const ANALYZE_RATE_LIMIT = { name: "ai_analyze", windowMs: 60_000, maxRequests: 5 };

/** POST /api/wrongbook/analyze — 错题一次性分析，不读写 ChatHistory */
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const rl = checkRateLimit(ANALYZE_RATE_LIMIT, `user_${user.userId}`);
  if (!rl.allowed) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  try {
    const { problemId, variantId } = await request.json();
    if (!problemId && !variantId) {
      return Response.json({ error: "缺少 problemId 或 variantId" }, { status: 400 });
    }

    // 免费用户限 1 次错因分析
    const sub = await getSubscriptionInfo(user.userId);
    if (!sub.isPaid) {
      const count = await prisma.wrongBookAnalysis.count({
        where: { userId: user.userId },
      });
      if (count >= 1) {
        return Response.json(
          { error: "analyze_limit", message: "免费分析次数已用完，订阅后解锁无限分析" },
          { status: 403 }
        );
      }
    }

    const stream = await streamWrongCodeAnalysis({
      userId: user.userId,
      problemId: problemId ? parseInt(problemId) : undefined,
      variantId: variantId ? parseInt(variantId) : undefined,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[WrongbookAnalyze]", e?.message ?? "unknown error");
    return Response.json({ error: "分析失败，请重试" }, { status: 500 });
  }
}
