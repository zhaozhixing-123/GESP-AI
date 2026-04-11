import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit } from "@/lib/subscription";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const problemId = parseInt(id);

    const allowed = await checkFreeLimit(user.userId, problemId);
    if (!allowed) {
      return Response.json(
        { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
        { status: 403 }
      );
    }

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        luoguId: true,
        title: true,
        level: true,
        tags: true,
        description: true,
        inputFormat: true,
        outputFormat: true,
        samples: true,
        // 不返回 testCases
      },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    return Response.json(problem);
  } catch {
    return Response.json({ error: "获取题目失败" }, { status: 500 });
  }
}
