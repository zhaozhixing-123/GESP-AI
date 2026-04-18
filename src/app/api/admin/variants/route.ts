import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { generateVariantProblem, VARIANTGEN_MODEL } from "@/lib/variantgen";
import { generateTestCases } from "@/lib/testgen";
import { verifyTestCases } from "@/lib/testverify";

const TARGET_VARIANTS_PER_PROBLEM = 4;

/**
 * POST /api/admin/variants
 * 为指定题目生成变形题（最多补足到 4 道），SSE 流式推送进度。
 * Body: { problemId: number }
 *
 * POST /api/admin/variants?batch=1
 * 批量为所有 ready 变形题不足 4 道的题目逐一触发生成。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const isBatch = url.searchParams.get("batch") === "1";

  if (isBatch) {
    return handleBatch(request);
  }

  const body = await request.json().catch(() => ({}));
  const problemId = parseInt(body.problemId);
  if (!problemId || isNaN(problemId)) {
    return Response.json({ error: "缺少 problemId" }, { status: 400 });
  }

  return makeStream((send) => runSingle(problemId, send));
}

// ─── SSE 流封装：所有 SSE 响应共用 ────────────────────────────────────────────

type Sender = (data: object) => void;

function makeStream(task: (send: Sender) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: Sender = (data) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* 客户端已断开 */ }
      };
      // keepalive：防止 Railway 代理因空闲超时断开
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* ignore */ }
      }, 20_000);

      try {
        await task(send);
      } catch (e: any) {
        console.error("[AdminVariants] 任务异常:", e?.message ?? e);
        send({ done: true, error: e?.message ?? "任务异常" });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── 单题生成：纯函数，通过 send 上报进度 ─────────────────────────────────────

async function runSingle(problemId: number, send: Sender): Promise<void> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true, title: true, description: true,
      inputFormat: true, outputFormat: true, samples: true,
      tags: true, level: true,
    },
  });

  if (!problem) {
    send({ done: true, error: "题目不存在" });
    return;
  }

  // 清理失败记录
  await prisma.variantProblem.deleteMany({
    where: { sourceId: problemId, genStatus: "failed" },
  });

  const existing = await prisma.variantProblem.findMany({
    where: { sourceId: problemId, genStatus: { in: ["ready", "generating"] } },
    select: { id: true, genStatus: true, title: true },
  });

  const readyCount      = existing.filter((v) => v.genStatus === "ready").length;
  const generatingCount = existing.filter((v) => v.genStatus === "generating").length;
  const needed = TARGET_VARIANTS_PER_PROBLEM - readyCount - generatingCount;

  const usedTitles: string[] = existing
    .filter((v) => v.title && v.title !== "生成中...")
    .map((v) => v.title);

  if (needed <= 0) {
    send({ done: true, message: `已有 ${readyCount} 道 ready 变形题，无需生成` });
    return;
  }

  send({ step: "start", message: `开始为「${problem.title}」生成 ${needed} 道变形题` });

  let successCount = 0;

  for (let i = 1; i <= needed; i++) {
    // 每次迭代前重新核查数量，防止并发请求超出上限
    const currentCount = await prisma.variantProblem.count({
      where: { sourceId: problemId, genStatus: { in: ["ready", "generating"] } },
    });
    if (currentCount >= TARGET_VARIANTS_PER_PROBLEM) {
      send({ step: "skipped", current: i, total: needed, message: `已达到 ${TARGET_VARIANTS_PER_PROBLEM} 道上限，停止生成` });
      break;
    }

    let variantId: number | null = null;
    try {
      const placeholder = await prisma.variantProblem.create({
        data: {
          sourceId: problemId, level: problem.level,
          title: `生成中...`, description: "", inputFormat: "", outputFormat: "",
          samples: "[]", genStatus: "generating",
        },
      });
      variantId = placeholder.id;

      send({ step: "variant_gen", current: i, total: needed, message: `第 ${i}/${needed} 道：生成题面...` });

      const draft = await generateVariantProblem(problem, [...usedTitles]);

      send({ step: "testgen", current: i, total: needed, message: `第 ${i}/${needed} 道：生成测试用例...` });

      const testCases = await generateTestCases(draft);

      send({ step: "testverify", current: i, total: needed, message: `第 ${i}/${needed} 道：Opus 复核 ${testCases.length} 个测试点...` });

      const verifyResult = await verifyTestCases(
        { ...draft, testCases: JSON.stringify(testCases) },
        true
      );

      const cleanedTestCases = testCases.filter((_, idx) =>
        verifyResult.details.find((d) => d.index === idx && d.status === "pass")
      );

      await prisma.variantProblem.update({
        where: { id: variantId },
        data: {
          title:         draft.title,
          description:   draft.description,
          inputFormat:   draft.inputFormat,
          outputFormat:  draft.outputFormat,
          samples:       draft.samples,
          tags:          draft.tags,
          level:         draft.level,
          testCases:     JSON.stringify(cleanedTestCases),
          genStatus:     "ready",
          genModel:      VARIANTGEN_MODEL,
          verifiedAt:    new Date(),
          verifiedCount: cleanedTestCases.length,
        },
      });

      usedTitles.push(draft.title);
      successCount++;
      send({
        step: "done_one", current: i, total: needed,
        variantId,
        message: `第 ${i}/${needed} 道完成，${cleanedTestCases.length} 个测试点`,
      });
    } catch (e: any) {
      console.error(`[AdminVariants] 第 ${i} 道失败:`, e.message);
      if (variantId) {
        await prisma.variantProblem.update({
          where: { id: variantId },
          data: { genStatus: "failed", genError: e.message },
        }).catch(() => {});
      }
      send({ step: "error_one", current: i, total: needed, message: `第 ${i}/${needed} 道失败: ${e.message}` });
    }
  }

  send({ done: true, message: `全部完成，成功生成 ${successCount}/${needed} 道变形题` });
}

// ─── 批量生成：复用 runSingle，不再嵌套 stream 透传 ────────────────────────────

async function handleBatch(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const levelParam = url.searchParams.get("level");
  const levelFilter = levelParam ? parseInt(levelParam) : null;

  const allProblems = await prisma.problem.findMany({
    where: levelFilter ? { level: levelFilter } : undefined,
    select: { id: true, title: true },
  });

  const variantCounts = await prisma.variantProblem.groupBy({
    by: ["sourceId"],
    where: { genStatus: "ready" },
    _count: { id: true },
  });

  const countMap = new Map(variantCounts.map((v) => [v.sourceId, v._count.id]));
  const needProblems = allProblems.filter(
    (p) => (countMap.get(p.id) ?? 0) < TARGET_VARIANTS_PER_PROBLEM
  );

  return makeStream(async (send) => {
    if (needProblems.length === 0) {
      send({ done: true, message: "所有题目已有 4 道变形题，无需生成" });
      return;
    }

    send({ step: "start", message: `共 ${needProblems.length} 道题需要补充变形题` });

    for (let pi = 0; pi < needProblems.length; pi++) {
      const p = needProblems[pi];
      send({ step: "problem", current: pi + 1, total: needProblems.length, message: `处理题目 ${pi + 1}/${needProblems.length}：${p.title}` });
      await runSingle(p.id, send);
    }

    send({ done: true, message: `批量生成完毕，处理了 ${needProblems.length} 道题` });
  });
}

// ─── GET：查询所有题目的变形题状态 ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const problemId = url.searchParams.get("problemId");

  if (problemId) {
    const variants = await prisma.variantProblem.findMany({
      where: { sourceId: parseInt(problemId) },
      select: {
        id: true, title: true, level: true, genStatus: true,
        genError: true, verifiedCount: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({ variants });
  }

  const counts = await prisma.variantProblem.groupBy({
    by: ["sourceId", "genStatus"],
    _count: { id: true },
  });

  const summary: Record<number, Record<string, number>> = {};
  for (const row of counts) {
    if (!summary[row.sourceId]) summary[row.sourceId] = {};
    summary[row.sourceId][row.genStatus] = row._count.id;
  }

  return Response.json({ summary });
}

// ─── 删除单道变形题 ────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const variantId = parseInt(url.searchParams.get("variantId") ?? "");
  if (!variantId || isNaN(variantId)) {
    return Response.json({ error: "缺少 variantId" }, { status: 400 });
  }

  const variant = await prisma.variantProblem.findUnique({
    where: { id: variantId },
    select: { id: true, sourceId: true },
  });
  if (!variant) return Response.json({ error: "变形题不存在" }, { status: 404 });

  await prisma.$transaction([
    prisma.wrongBookAnalysis.deleteMany({ where: { variantId } }),
    prisma.wrongBook.deleteMany({ where: { variantId } }),
    prisma.chatHistory.deleteMany({ where: { variantId } }),
    prisma.variantSubmission.deleteMany({ where: { variantId } }),
    prisma.variantProblem.delete({ where: { id: variantId } }),
  ]);

  return Response.json({ deleted: true, sourceId: variant.sourceId });
}
