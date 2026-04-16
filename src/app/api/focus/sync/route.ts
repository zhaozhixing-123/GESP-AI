import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

/** POST /api/focus/sync — 同步每日专注数据到服务端 */
export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "登录已过期" }, { status: 401 });

  try {
    const { date, focusMs, distractMs } = await request.json();

    if (!date || typeof focusMs !== "number" || typeof distractMs !== "number") {
      return Response.json({ error: "参数不完整" }, { status: 400 });
    }

    // 防止篡改：上限 24 小时
    const maxMs = 24 * 3600_000;
    const safeFocus = Math.max(0, Math.min(focusMs, maxMs));
    const safeDistract = Math.max(0, Math.min(distractMs, maxMs));

    await prisma.dailyFocusLog.upsert({
      where: { userId_date: { userId: payload.userId, date } },
      create: {
        userId: payload.userId,
        date,
        focusMs: safeFocus,
        distractMs: safeDistract,
      },
      update: {
        focusMs: safeFocus,
        distractMs: safeDistract,
      },
    });

    return Response.json({ ok: true });
  } catch (e) {
    console.error("[FocusSync]", e);
    return Response.json({ error: "同步失败" }, { status: 500 });
  }
}

/** GET /api/focus/sync?date=YYYY-MM-DD — 获取某天的专注数据（用于恢复） */
export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "登录已过期" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date");
  if (!date) return Response.json({ error: "date required" }, { status: 400 });

  const log = await prisma.dailyFocusLog.findUnique({
    where: { userId_date: { userId: payload.userId, date } },
    select: { focusMs: true, distractMs: true },
  });

  return Response.json({
    focusMs: log?.focusMs ?? 0,
    distractMs: log?.distractMs ?? 0,
  });
}
