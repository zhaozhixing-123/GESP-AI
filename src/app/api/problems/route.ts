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
      isVariant:  false as const,
    }));

    // 如果已登录，在每道题后面插入该用户已解锁的变形题
    let result: typeof problemsWithStatus[number][] = problemsWithStatus as any[];
    if (user && problems.length > 0) {
      const problemIds = problems.map((p) => p.id);

      // 查询本页题目的解锁批次
      const unlocks = await prisma.variantUnlock.findMany({
        where: { userId: user.userId, problemId: { in: problemIds } },
        select: { problemId: true, batch: true },
      });

      if (unlocks.length > 0) {
        // 按源题分组
        const unlockMap = new Map<number, Set<number>>();
        for (const u of unlocks) {
          const s = unlockMap.get(u.problemId) ?? new Set<number>();
          s.add(u.batch);
          unlockMap.set(u.problemId, s);
        }

        // 拉取这些源题的 ready 变形题（按 createdAt 决定批次）
        const variantRows = await prisma.variantProblem.findMany({
          where: { sourceId: { in: problemIds }, genStatus: "ready" },
          select: { id: true, sourceId: true, title: true, level: true, tags: true },
          orderBy: { createdAt: "asc" },
        });

        // 按源题分组，取已解锁批次对应的变形题
        const variantsBySource = new Map<number, typeof variantRows>();
        for (const v of variantRows) {
          const arr = variantsBySource.get(v.sourceId) ?? [];
          arr.push(v);
          variantsBySource.set(v.sourceId, arr);
        }

        // 重新组装列表（真题后面紧跟变形题）
        const expanded: any[] = [];
        for (const p of problemsWithStatus) {
          expanded.push(p);
          const batches = unlockMap.get(p.id);
          if (!batches) continue;
          const variants = variantsBySource.get(p.id) ?? [];
          for (let i = 0; i < variants.length; i++) {
            const batch = i < 2 ? 1 : 2;
            if (batches.has(batch)) {
              expanded.push({
                id:         variants[i].id,
                luoguId:    p.luoguId,   // 继承源题编号用于显示
                sourceId:   p.id,
                title:      variants[i].title,
                level:      variants[i].level,
                tags:       variants[i].tags,
                userStatus: null,
                isVariant:  true as const,
              });
            }
          }
        }
        result = expanded;
      }
    }

    return Response.json({ problems: result, total, page, pageSize });
  } catch {
    return Response.json({ error: "获取题目列表失败" }, { status: 500 });
  }
}
