import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const level = url.searchParams.get("level");
    const search = url.searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = 20;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (level) where.level = parseInt(level);
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { luoguId: { contains: search } },
      ];
    }

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        select: { id: true, luoguId: true, title: true, level: true, tags: true },
        orderBy: { luoguId: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.problem.count({ where }),
    ]);

    // 若已登录，附带该用户对当前页题目的做题状态
    const user = getUserFromRequest(request);
    let statusMap: Record<number, "ac" | "attempted"> = {};
    if (user && problems.length > 0) {
      const problemIds = problems.map((p) => p.id);
      const [acSubs, triedSubs] = await Promise.all([
        prisma.submission.findMany({
          where: { userId: user.userId, status: "AC", problemId: { in: problemIds } },
          select: { problemId: true },
          distinct: ["problemId"],
        }),
        prisma.submission.findMany({
          where: { userId: user.userId, problemId: { in: problemIds } },
          select: { problemId: true },
          distinct: ["problemId"],
        }),
      ]);
      const acSet = new Set(acSubs.map((s) => s.problemId));
      for (const s of triedSubs) {
        statusMap[s.problemId] = acSet.has(s.problemId) ? "ac" : "attempted";
      }
    }

    const problemsWithStatus = problems.map((p) => ({
      ...p,
      userStatus: statusMap[p.id] ?? null,
    }));

    return Response.json({ problems: problemsWithStatus, total, page, pageSize });
  } catch {
    return Response.json({ error: "获取题目列表失败" }, { status: 500 });
  }
}
