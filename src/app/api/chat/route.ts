import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit } from "@/lib/subscription";
import { chat } from "@/lib/aiteacher";

/** POST /api/chat — 发送消息给 AI 老师（流式响应） */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { problemId, message, code } = await request.json();

    if (!problemId || !message?.trim()) {
      return Response.json({ error: "题目ID和消息不能为空" }, { status: 400 });
    }

    const allowed = await checkFreeLimit(user.userId, parseInt(problemId));
    if (!allowed) {
      return Response.json(
        { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
        { status: 403 }
      );
    }

    const stream = await chat({
      problemId: parseInt(problemId),
      userId: user.userId,
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

/** GET /api/chat?problemId=X — 获取聊天历史 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const problemId = url.searchParams.get("problemId");

    if (!problemId) {
      return Response.json({ error: "缺少 problemId" }, { status: 400 });
    }

    const messages = await prisma.chatHistory.findMany({
      where: { userId: user.userId, problemId: parseInt(problemId) },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });

    return Response.json({ messages });
  } catch {
    return Response.json({ error: "获取聊天历史失败" }, { status: 500 });
  }
}
