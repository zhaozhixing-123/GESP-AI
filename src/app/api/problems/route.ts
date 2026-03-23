import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const level = url.searchParams.get("level");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = 20;

    const where = level ? { level: parseInt(level) } : {};

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        select: { id: true, luoguId: true, title: true, level: true },
        orderBy: { luoguId: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.problem.count({ where }),
    ]);

    return Response.json({ problems, total, page, pageSize });
  } catch {
    return Response.json({ error: "获取题目列表失败" }, { status: 500 });
  }
}
