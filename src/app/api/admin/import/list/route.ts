import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fetchLuoguProblemList } from "@/lib/luogu";

/** POST /api/admin/import/list — 获取洛谷列表页的所有题号 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { luoguUrl } = await request.json();
    if (!luoguUrl) {
      return Response.json({ error: "请提供洛谷链接" }, { status: 400 });
    }

    const pids = await fetchLuoguProblemList(luoguUrl);

    // 查哪些已存在
    const existing = await prisma.problem.findMany({
      where: { luoguId: { in: pids } },
      select: { luoguId: true },
    });
    const existingSet = new Set(existing.map((e) => e.luoguId));

    return Response.json({
      total: pids.length,
      pids,
      existing: existing.map((e) => e.luoguId),
      toImport: pids.filter((pid) => !existingSet.has(pid)),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
