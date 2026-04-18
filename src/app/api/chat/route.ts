import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit, getSubscriptionInfo } from "@/lib/subscription";
import { chat } from "@/lib/aiteacher";
import { checkRateLimit } from "@/lib/ratelimit";

const CHAT_RATE_LIMIT = { name: "ai_chat", windowMs: 60_000, maxRequests: 10 };

// 简易并发锁：同一用户同时只能有一个 AI 请求
const activeUsers = new Set<number>();

/** POST /api/chat — 发送消息给 AI 老师（流式响应） */
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const rl = checkRateLimit(CHAT_RATE_LIMIT, `user_${user.userId}`);
  if (!rl.allowed) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  if (activeUsers.has(user.userId)) {
    return Response.json({ error: "上一条消息还在处理中，请稍候" }, { status: 429 });
  }

  try {
    const { problemId, variantId, message, code } = await request.json();

    if (!message?.trim()) {
      return Response.json({ error: "消息不能为空" }, { status: 400 });
    }
    if (message.length > 2000) {
      return Response.json({ error: "消息长度不能超过 2000 字符" }, { status: 400 });
    }
    if (!problemId && !variantId) {
      return Response.json({ error: "需要提供 problemId 或 variantId" }, { status: 400 });
    }

    // 真题：检查免费题目额度
    if (!variantId) {
      const allowed = await checkFreeLimit(user.userId, parseInt(problemId));
      if (!allowed) {
        return Response.json(
          { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
          { status: 403 }
        );
      }
    }

    // 免费用户对话限 5 次（真题和变形题都受限）
    const sub = await getSubscriptionInfo(user.userId);
    if (!sub.isPaid) {
      const chatWhere = variantId
        ? { userId: user.userId, variantId: parseInt(variantId), role: "user" as const }
        : { userId: user.userId, problemId: parseInt(problemId), role: "user" as const };
      const chatCount = await prisma.chatHistory.count({ where: chatWhere });
      if (chatCount >= 5) {
        return Response.json(
          { error: "chat_limit", message: "免费对话次数已用完，订阅后解锁无限对话" },
          { status: 403 }
        );
      }
    }

    // 锁在这里获取——此时所有校验已过，准备真正调用 AI
    activeUsers.add(user.userId);
    let lockReleased = false;
    const releaseLock = () => {
      if (lockReleased) return;
      lockReleased = true;
      activeUsers.delete(user.userId);
    };

    // 拉取用户目标级别，用于决定 AI 老师档位
    const userRow = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { targetLevel: true },
    });

    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await chat({
        problemId: variantId ? undefined : parseInt(problemId),
        variantId: variantId ? parseInt(variantId) : undefined,
        userId:  user.userId,
        message: message.trim(),
        code,
        targetLevel: userRow?.targetLevel ?? null,
      });
    } catch (e) {
      releaseLock();
      throw e;
    }

    // 包一层 ReadableStream，流读完或被取消时才释放锁（否则 return 一瞬间就解锁了）
    const reader = stream.getReader();
    const wrapped = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            releaseLock();
          } else {
            controller.enqueue(value);
          }
        } catch (err) {
          releaseLock();
          controller.error(err);
        }
      },
      cancel(reason) {
        releaseLock();
        return reader.cancel(reason);
      },
    });

    return new Response(wrapped, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[Chat]", e?.message ?? "unknown error");
    activeUsers.delete(user.userId);
    return Response.json({ error: "对话失败，请重试" }, { status: 500 });
  }
}

/** GET /api/chat?problemId=X 或 ?variantId=X — 获取聊天历史 */
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
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

    const rows = await prisma.chatHistory.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    // 批量拉当前用户对这些 assistant 消息的历史反馈，回显到 UI
    const assistantIds = rows.filter((r) => r.role === "assistant").map((r) => r.id);
    const feedbacks = assistantIds.length > 0
      ? await prisma.feedback.findMany({
          where: {
            userId: user.userId,
            targetType: "chat",
            targetId: { in: assistantIds },
          },
          select: { targetId: true, vote: true, reasons: true, comment: true },
        })
      : [];
    const fbMap = new Map(feedbacks.map((f) => [f.targetId, f]));

    const messages = rows.map((r) => {
      if (r.role === "assistant") {
        const fb = fbMap.get(r.id);
        return {
          role: r.role,
          content: r.content,
          createdAt: r.createdAt,
          chatHistoryId: r.id,
          feedback: fb
            ? {
                vote: fb.vote,
                reasons: fb.reasons ? (JSON.parse(fb.reasons) as string[]) : [],
                comment: fb.comment,
              }
            : null,
        };
      }
      return { role: r.role, content: r.content, createdAt: r.createdAt };
    });

    return Response.json({ messages });
  } catch {
    return Response.json({ error: "获取聊天历史失败" }, { status: 500 });
  }
}
