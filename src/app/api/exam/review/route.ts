import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSubscriptionInfo } from "@/lib/subscription";
import { streamExamReview, ExamProblemEntry } from "@/lib/aiteacher";
import { checkRateLimit } from "@/lib/ratelimit";

const REVIEW_RATE_LIMIT = { name: "ai_review", windowMs: 300_000, maxRequests: 3 };

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const sub = await getSubscriptionInfo(user.userId);
  if (!sub.isPaid) {
    return Response.json(
      { error: "模拟考试为会员功能，请订阅后使用" },
      { status: 403 }
    );
  }

  const rl = checkRateLimit(REVIEW_RATE_LIMIT, `user_${user.userId}`);
  if (!rl.allowed) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  try {
    const { problems, timeUsedMinutes } = await request.json() as {
      problems: ExamProblemEntry[];
      timeUsedMinutes: number;
    };

    if (!problems?.length) {
      return Response.json({ error: "题目数据不能为空" }, { status: 400 });
    }
    if (problems.length > 10) {
      return Response.json({ error: "题目数量超限" }, { status: 400 });
    }
    for (const p of problems) {
      if ((p.title?.length ?? 0) > 200 ||
          (p.description?.length ?? 0) > 5000 ||
          (p.code?.length ?? 0) > 20000) {
        return Response.json({ error: "题目内容过长" }, { status: 400 });
      }
    }

    const stream = await streamExamReview(problems, timeUsedMinutes);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[ExamReview]", e?.message ?? "unknown error");
    return Response.json({ error: "生成报告失败，请重试" }, { status: 500 });
  }
}
