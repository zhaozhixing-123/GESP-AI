import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(id) },
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
