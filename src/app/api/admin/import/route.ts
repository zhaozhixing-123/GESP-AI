import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fetchLuoguProblem, fetchLuoguProblemList } from "@/lib/luogu";

/** POST /api/admin/import — 单题或批量导入 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();

    // 批量导入模式：传入 luoguUrl（洛谷列表页链接）
    if (body.luoguUrl) {
      return handleBatchImport(body.luoguUrl, body.level);
    }

    // 单题导入模式：传入 luoguId
    if (body.luoguId) {
      return handleSingleImport(body.luoguId.trim().toUpperCase(), body.level);
    }

    return Response.json({ error: "请提供 luoguId 或 luoguUrl" }, { status: 400 });
  } catch (e: any) {
    console.error("Import error:", e);
    return Response.json({ error: "导入失败: " + e.message }, { status: 500 });
  }
}

async function handleSingleImport(luoguId: string, manualLevel?: number) {
  const existing = await prisma.problem.findUnique({ where: { luoguId } });
  if (existing) {
    return Response.json(
      { error: `题目 ${luoguId} 已存在（ID: ${existing.id}）` },
      { status: 409 }
    );
  }

  const data = await fetchLuoguProblem(luoguId, manualLevel);

  const problem = await prisma.problem.create({ data });

  return Response.json(
    {
      message: "导入成功",
      problem: { id: problem.id, luoguId: problem.luoguId, title: problem.title, level: problem.level },
    },
    { status: 201 }
  );
}

async function handleBatchImport(luoguUrl: string, manualLevel?: number) {
  // 从列表页获取所有题号
  const pids = await fetchLuoguProblemList(luoguUrl);

  if (pids.length === 0) {
    return Response.json({ error: "该链接没有找到题目" }, { status: 400 });
  }

  // 查哪些已存在
  const existing = await prisma.problem.findMany({
    where: { luoguId: { in: pids } },
    select: { luoguId: true },
  });
  const existingSet = new Set(existing.map((e) => e.luoguId));

  const toImport = pids.filter((pid) => !existingSet.has(pid));

  const results: Array<{ luoguId: string; title: string; id: number; status: "ok" | "error"; error?: string }> = [];
  const skipped = pids.length - toImport.length;

  for (let i = 0; i < toImport.length; i++) {
    const pid = toImport[i];
    console.log(`[批量导入] ${i + 1}/${toImport.length}: ${pid}`);
    try {
      const data = await fetchLuoguProblem(pid, manualLevel);
      const problem = await prisma.problem.create({ data });
      results.push({ luoguId: pid, title: problem.title, id: problem.id, status: "ok" });
    } catch (e: any) {
      console.error(`[批量导入] ${pid} 失败:`, e.message);
      results.push({ luoguId: pid, title: "", id: 0, status: "error", error: e.message });
    }
    // 避免洛谷限流
    if (i < toImport.length - 1) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  const successCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "error").length;

  return Response.json({
    message: `批量导入完成：共 ${pids.length} 题，成功 ${successCount}，失败 ${failCount}，跳过已存在 ${skipped}`,
    total: pids.length,
    success: successCount,
    failed: failCount,
    skipped,
    results,
  });
}
