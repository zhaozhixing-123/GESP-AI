import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { getSubscriptionInfo } from "@/lib/subscription";
import { streamWrongCodeAnalysis } from "@/lib/aiteacher";

/** POST /api/wrongbook/analyze — 错题一次性分析，不读写 ChatHistory */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  try {
    const { problemId } = await request.json();
    if (!problemId) return Response.json({ error: "缺少 problemId" }, { status: 400 });

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
      problemId: parseInt(problemId),
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[WrongbookAnalyze]", e);
    return Response.json({ error: e.message || "分析失败" }, { status: 500 });
  }
}
