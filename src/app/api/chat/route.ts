import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit, getSubscriptionInfo } from "@/lib/subscription";
import { chat } from "@/lib/aiteacher";

/** POST /api/chat — 发送消息给 AI 老师（流式响应） */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { problemId, variantId, message, code } = await request.json();

    if (!message?.trim()) {
      return Response.json({ error: "消息不能为空" }, { status: 400 });
    }
    if (!problemId && !variantId) {
      return Response.json({ error: "需要提供 problemId 或 variantId" }, { status: 400 });
    }

    // 变形题对话跳过付费墙（入口已受 VariantUnlock 保护），真题走正常流程
    if (!variantId) {
      const allowed = await checkFreeLimit(user.userId, parseInt(problemId));
      if (!allowed) {
        return Response.json(
          { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
          { status: 403 }
        );
      }

      // 免费用户在该题对话限 5 次
      const sub = await getSubscriptionInfo(user.userId);
      if (!sub.isPaid) {
        const chatCount = await prisma.chatHistory.count({
          where: { userId: user.userId, problemId: parseInt(problemId), role: "user" },
        });
        if (chatCount >= 5) {
          return Response.json(
            { error: "chat_limit", message: "免费对话次数已用完，订阅后解锁无限对话" },
            { status: 403 }
          );
        }
      }
    }

    const stream = await chat({
      problemId: variantId ? undefined : parseInt(problemId),
      variantId: variantId ? parseInt(variantId) : undefined,
      userId:  user.userId,
      message: message.trim(),
      code,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("Chat error:", e);
    return Response.json({ error: e.message || "对话失败" }, { status: 500 });
  }
}

/** GET /api/chat?problemId=X 或 ?variantId=X — 获取聊天历史 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const url       = new URL(request.url);
    const problemId = url.searchParams.get("problemId");
    const variantId = url.searchParams.get("variantId");

    if (!problemId && !variantId) {
      return Response.json({ error: "缺少 problemId 或 variantId" }, { status: 400 });
    }

    const where = variantId
      ? { userId: user.userId, variantId: parseInt(variantId) }
      : { userId: user.userId, problemId: parseInt(problemId!) };

    const messages = await prisma.chatHistory.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });

    return Response.json({ messages });
  } catch {
    return Response.json({ error: "获取聊天历史失败" }, { status: 500 });
  }
}
