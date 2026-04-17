import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/** GET /api/submissions/[id] — 查看单次真题提交的完整代码（仅本人） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const submissionId = parseInt(id);
  if (isNaN(submissionId)) {
    return Response.json({ error: "无效提交 ID" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      userId: true,
      problemId: true,
      code: true,
      status: true,
      language: true,
      timeUsed: true,
      memoryUsed: true,
      createdAt: true,
    },
  });

  // 归属校验失败与不存在统一返回 404，不泄漏其他用户提交的存在性
  if (!submission || submission.userId !== user.userId) {
    return Response.json({ error: "提交记录不存在" }, { status: 404 });
  }

  const { userId: _, ...rest } = submission;
  return Response.json(rest);
}
