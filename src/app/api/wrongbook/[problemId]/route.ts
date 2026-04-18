import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/** GET /api/wrongbook/[problemId] — 查询某题是否在错题本中 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { problemId } = await params;
  const entry = await prisma.wrongBook.findUnique({
    where: {
      userId_problemId: { userId: user.userId, problemId: parseInt(problemId) },
    },
  });

  return Response.json({ inWrongBook: !!entry });
}

/** DELETE /api/wrongbook/[problemId] — 从错题本移除某题 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  try {
    const { problemId } = await params;
    await prisma.wrongBook.delete({
      where: {
        userId_problemId: { userId: user.userId, problemId: parseInt(problemId) },
      },
    });
    return Response.json({ removed: true });
  } catch {
    return Response.json({ error: "移除失败" }, { status: 500 });
  }
}
