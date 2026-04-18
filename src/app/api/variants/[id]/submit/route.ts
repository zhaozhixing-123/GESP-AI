import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { judgeAll, mapStatus, getErrorMessage } from "@/lib/judge0";
import { normalizeOutput } from "@/lib/normalize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await params;
  const variantId = parseInt(id);
  if (isNaN(variantId)) return Response.json({ error: "无效变形题 ID" }, { status: 400 });

  try {
    const { code } = await request.json();
    if (!code?.trim()) return Response.json({ error: "代码不能为空" }, { status: 400 });
    if (code.length > 50000) return Response.json({ error: "代码长度不能超过 50000 字符" }, { status: 400 });

    // 鉴权：用户必须有解锁记录
    const variant = await prisma.variantProblem.findUnique({
      where: { id: variantId },
      select: { id: true, sourceId: true, samples: true, testCases: true, genStatus: true },
    });

    if (!variant || variant.genStatus !== "ready") {
      return Response.json({ error: "变形题不存在" }, { status: 404 });
    }

    const hasUnlock = await checkUnlocked(user.userId, variant.sourceId, variantId);
    if (!hasUnlock) return Response.json({ error: "无访问权限" }, { status: 404 });

    const samples: Array<{ input: string; output: string }>  = JSON.parse(variant.samples  || "[]");
    const extraTests: Array<{ input: string; output: string }> = JSON.parse(variant.testCases || "[]");
    const allTests = [...samples, ...extraTests];

    if (allTests.length === 0) {
      return Response.json({ error: "该变形题暂无测试数据" }, { status: 400 });
    }

    // 批量判题
    const judge0Results = await judgeAll(code, allTests.map((t) => t.input));

    const results: Array<{
      input: string; expectedOutput: string; actualOutput: string;
      status: string; time: string | null; memory: number | null;
    }> = [];

    let overallStatus = "AC";
    let totalTime = 0;
    let maxMemory = 0;

    for (let idx = 0; idx < allTests.length; idx++) {
      const j  = judge0Results[idx];
      const st = mapStatus(j);
      const actual   = normalizeOutput(j.stdout || "");
      const expected = normalizeOutput(allTests[idx].output);

      let finalStatus = st === "AC" ? (actual === expected ? "AC" : "WA") : st;

      if (finalStatus === "CE") {
        results.push({ input: allTests[idx].input, expectedOutput: expected, actualOutput: getErrorMessage(j), status: "CE", time: j.time, memory: j.memory });
        overallStatus = "CE";
        break;
      }

      results.push({ input: allTests[idx].input, expectedOutput: expected, actualOutput: actual, status: finalStatus, time: j.time, memory: j.memory });
      if (j.time) totalTime += parseFloat(j.time) * 1000;
      if (j.memory) maxMemory = Math.max(maxMemory, j.memory);
      if (finalStatus !== "AC" && overallStatus === "AC") overallStatus = finalStatus;
    }

    // 保存提交记录
    const submission = await prisma.variantSubmission.create({
      data: {
        userId: user.userId, variantId, code, language: "cpp",
        status: overallStatus, timeUsed: Math.round(totalTime), memoryUsed: maxMemory,
      },
    });

    // 非 AC → 加入错题本 + 触发 batch2 解锁
    if (overallStatus !== "AC") {
      await prisma.wrongBook.upsert({
        where: { userId_variantId: { userId: user.userId, variantId } },
        update: {},
        create: { userId: user.userId, variantId },
      });

      await tryUnlockBatch2(user.userId, variant.sourceId, variantId);
    }

    return Response.json({ submission, results });
  } catch (e: any) {
    console.error("[VariantSubmit]", e?.message ?? "unknown error");
    return Response.json({ error: "提交失败，请重试" }, { status: 500 });
  }
}

/** 检查用户是否已解锁该变形题（batch1 或 batch2 中对应的那一批） */
async function checkUnlocked(userId: number, sourceId: number, variantId: number): Promise<boolean> {
  // 获取该源题所有 ready 变形题，按 createdAt 排序确定批次
  const readyVariants = await prisma.variantProblem.findMany({
    where: { sourceId, genStatus: "ready" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const idx = readyVariants.findIndex((v) => v.id === variantId);
  if (idx === -1) return false;

  const batch = idx < 2 ? 1 : 2;

  const unlock = await prisma.variantUnlock.findUnique({
    where: { userId_problemId_batch: { userId, problemId: sourceId, batch } },
  });

  return !!unlock;
}

/** 如果本次 WA 的是 batch1 变形题，则解锁 batch2 */
async function tryUnlockBatch2(userId: number, sourceId: number, variantId: number): Promise<void> {
  const readyVariants = await prisma.variantProblem.findMany({
    where: { sourceId, genStatus: "ready" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const idx = readyVariants.findIndex((v) => v.id === variantId);
  if (idx === -1 || idx >= 2) return; // 不是 batch1，不触发

  // 只有当 batch2 有变形题时才写解锁记录
  if (readyVariants.length > 2) {
    await prisma.variantUnlock.upsert({
      where: { userId_problemId_batch: { userId, problemId: sourceId, batch: 2 } },
      update: {},
      create: { userId, problemId: sourceId, batch: 2 },
    });
  }
}
