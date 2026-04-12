import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const level = parseInt(url.searchParams.get("level") || "3");
  const count = Math.min(Math.max(parseInt(url.searchParams.get("count") || "5"), 1), 10);

  try {
    const all = await prisma.problem.findMany({
      where: { level },
      select: {
        id: true,
        title: true,
        description: true,
        inputFormat: true,
        outputFormat: true,
        samples: true,
        level: true,
        luoguId: true,
        tags: true,
      },
    });

    if (all.length === 0) {
      return Response.json({ error: "该级别暂无题目" }, { status: 404 });
    }

    // 随机打乱后取前 count 个
    const shuffled = all.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    return Response.json({ problems: selected });
  } catch (e: any) {
    console.error("Exam problems error:", e);
    return Response.json({ error: e.message || "获取题目失败" }, { status: 500 });
  }
}
