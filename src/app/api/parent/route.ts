import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest, getJwtSecret } from "@/lib/auth";
import { isValidWebhookUrl } from "@/lib/webhook";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function getParentToken(request: NextRequest): string | null {
  return request.headers.get("x-parent-token");
}

function verifyParentToken(token: string): { userId: number } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as any;
    if (payload.type !== "parent") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// POST: 验证家长密码，返回 parentToken
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { password } = await request.json();
  if (!password) return Response.json({ error: "请输入家长密码" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { parentPassword: true },
  });

  if (!dbUser?.parentPassword) {
    return Response.json({ error: "尚未设置家长密码" }, { status: 400 });
  }

  const valid = await bcrypt.compare(password, dbUser.parentPassword);
  if (!valid) return Response.json({ error: "家长密码错误" }, { status: 403 });

  const parentToken = jwt.sign(
    { userId: user.userId, type: "parent" },
    getJwtSecret(),
    { expiresIn: "15m" }
  );

  return Response.json({ parentToken });
}

// GET: 获取家长设置（需要 parentToken）
export async function GET(request: NextRequest) {
  const pt = getParentToken(request);
  if (!pt) return Response.json({ error: "需要家长验证" }, { status: 401 });
  const parent = verifyParentToken(pt);
  if (!parent) return Response.json({ error: "家长验证已过期" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: parent.userId },
    select: { feishuWebhook: true, notifyThresholdMin: true },
  });

  return Response.json({
    feishuWebhook: user?.feishuWebhook || "",
    notifyThresholdMin: user?.notifyThresholdMin ?? 2,
  });
}

// PUT: 更新飞书 Webhook（需要 parentToken）
export async function PUT(request: NextRequest) {
  const pt = getParentToken(request);
  if (!pt) return Response.json({ error: "需要家长验证" }, { status: 401 });
  const parent = verifyParentToken(pt);
  if (!parent) return Response.json({ error: "家长验证已过期" }, { status: 401 });

  const { feishuWebhook, notifyThresholdMin } = await request.json();

  if (feishuWebhook && !isValidWebhookUrl(feishuWebhook)) {
    return Response.json(
      { error: "Webhook URL 不合法，仅支持飞书 Webhook（https://open.feishu.cn/...）" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { feishuWebhook: feishuWebhook || null };
  if (typeof notifyThresholdMin === "number" && notifyThresholdMin >= 1 && notifyThresholdMin <= 30) {
    data.notifyThresholdMin = notifyThresholdMin;
  }

  await prisma.user.update({
    where: { id: parent.userId },
    data,
  });

  return Response.json({ message: "保存成功" });
}
