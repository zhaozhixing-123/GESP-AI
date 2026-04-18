import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 用户显式反馈：POST 记录赞/踩（同一用户同一目标再点相同 vote 会 toggle 清除）；
 * PATCH 补充踩的原因 chip + 可选一句话评论。
 *
 * targetType 支持：chat（目前只实现这一个，其他 targetType 后续扩展）。
 * chat 的 targetId = ChatHistory.id，必须归属当前用户且为 assistant 消息。
 */

const VALID_REASONS = new Set(["不准确", "太浅", "听不懂", "跑题", "其他"]);
const MAX_COMMENT_LEN = 200;

type Vote = "up" | "down";

function isVote(v: unknown): v is Vote {
  return v === "up" || v === "down";
}

/** 校验目标合法性，并返回用于冗余索引的 llmCallId */
async function resolveChatTarget(
  userId: number,
  targetId: number,
): Promise<{ ok: true; llmCallId: number | null } | { ok: false; status: number; error: string }> {
  const msg = await prisma.chatHistory.findUnique({
    where: { id: targetId },
    select: { userId: true, role: true, llmCallId: true },
  });
  if (!msg || msg.userId !== userId || msg.role !== "assistant") {
    return { ok: false, status: 404, error: "目标不存在" };
  }
  return { ok: true, llmCallId: msg.llmCallId };
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体无效" }, { status: 400 });
  }

  const { targetType, targetId, vote } = (body ?? {}) as {
    targetType?: string;
    targetId?: number;
    vote?: string;
  };

  if (targetType !== "chat") {
    return Response.json({ error: "不支持的 targetType" }, { status: 400 });
  }
  if (!Number.isInteger(targetId) || (targetId as number) <= 0) {
    return Response.json({ error: "targetId 无效" }, { status: 400 });
  }
  if (!isVote(vote)) {
    return Response.json({ error: "vote 必须为 up 或 down" }, { status: 400 });
  }

  const resolved = await resolveChatTarget(user.userId, targetId as number);
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }

  const existing = await prisma.feedback.findUnique({
    where: {
      userId_targetType_targetId: {
        userId: user.userId,
        targetType,
        targetId: targetId as number,
      },
    },
    select: { id: true, vote: true },
  });

  // 同 vote 再次点击 → 删除（toggle 清空）
  if (existing && existing.vote === vote) {
    await prisma.feedback.delete({ where: { id: existing.id } });
    return Response.json({ vote: null });
  }

  // 不同 vote → 覆盖并清空 reasons/comment
  if (existing) {
    await prisma.feedback.update({
      where: { id: existing.id },
      data: {
        vote,
        reasons: null,
        comment: null,
        llmCallId: resolved.llmCallId,
      },
    });
    return Response.json({ vote });
  }

  await prisma.feedback.create({
    data: {
      userId: user.userId,
      targetType,
      targetId: targetId as number,
      llmCallId: resolved.llmCallId,
      vote,
    },
  });
  return Response.json({ vote });
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体无效" }, { status: 400 });
  }

  const { targetType, targetId, reasons, comment } = (body ?? {}) as {
    targetType?: string;
    targetId?: number;
    reasons?: unknown;
    comment?: unknown;
  };

  if (targetType !== "chat") {
    return Response.json({ error: "不支持的 targetType" }, { status: 400 });
  }
  if (!Number.isInteger(targetId) || (targetId as number) <= 0) {
    return Response.json({ error: "targetId 无效" }, { status: 400 });
  }
  if (!Array.isArray(reasons) || reasons.length === 0 || reasons.length > 5) {
    return Response.json({ error: "reasons 必须为 1-5 项数组" }, { status: 400 });
  }
  const unique = Array.from(new Set(reasons));
  if (unique.some((r) => typeof r !== "string" || !VALID_REASONS.has(r))) {
    return Response.json({ error: "reasons 含非法选项" }, { status: 400 });
  }

  const hasOther = unique.includes("其他");
  let normalizedComment: string | null = null;
  if (hasOther) {
    if (typeof comment !== "string" || !comment.trim()) {
      return Response.json({ error: "选择「其他」时需要填写一句话" }, { status: 400 });
    }
    normalizedComment = comment.trim().slice(0, MAX_COMMENT_LEN);
  }

  const existing = await prisma.feedback.findUnique({
    where: {
      userId_targetType_targetId: {
        userId: user.userId,
        targetType,
        targetId: targetId as number,
      },
    },
    select: { id: true, vote: true },
  });

  if (!existing || existing.vote !== "down") {
    return Response.json({ error: "请先点踩" }, { status: 400 });
  }

  await prisma.feedback.update({
    where: { id: existing.id },
    data: {
      reasons: JSON.stringify(unique),
      comment: normalizedComment,
    },
  });
  return Response.json({ ok: true });
}
