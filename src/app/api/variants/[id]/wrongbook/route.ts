import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/** GET /api/variants/[id]/wrongbook — 查询变形题是否在错题本 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const variantId = parseInt(id);
  if (isNaN(variantId)) return Response.json({ inWrongBook: false });

  const entry = await prisma.wrongBook.findUnique({
    where: { userId_variantId: { userId: user.userId, variantId } },
  });

  return Response.json({ inWrongBook: !!entry });
}

/** POST /api/variants/[id]/wrongbook — 加入错题本 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const variantId = parseInt(id);
  if (isNaN(variantId)) return Response.json({ error: "无效变形题 ID" }, { status: 400 });

  await prisma.wrongBook.upsert({
    where: { userId_variantId: { userId: user.userId, variantId } },
    update: {},
    create: { userId: user.userId, variantId },
  });

  return Response.json({ added: true });
}

/** DELETE /api/variants/[id]/wrongbook — 移出错题本 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const variantId = parseInt(id);

  await prisma.wrongBook.delete({
    where: { userId_variantId: { userId: user.userId, variantId } },
  }).catch(() => {});

  return Response.json({ removed: true });
}
