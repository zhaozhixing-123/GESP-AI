import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

// GET: 检查是否已设置家长密码
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { parentPassword: true },
  });

  return Response.json({ hasParentPassword: !!dbUser?.parentPassword });
}
