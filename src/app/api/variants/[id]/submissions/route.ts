import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const variantId = parseInt(id);
  if (isNaN(variantId)) return Response.json({ error: "无效变形题 ID" }, { status: 400 });

  const submissions = await prisma.variantSubmission.findMany({
    where: { userId: user.userId, variantId },
    select: {
      id: true, status: true, language: true,
      timeUsed: true, memoryUsed: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return Response.json({ submissions });
}
