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
  const auth = requireAdmin(request);
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

  return handleSingle(problemId);
}

// ─── 单题生成 ─────────────────────────────────────────────────────────────────

async function handleSingle(problemId: number): Promise<Response> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true, title: true, description: true,
      inputFormat: true, outputFormat: true, samples: true,
      tags: true, level: true,
    },
  });

  if (!problem) {
    return Response.json({ error: "题目不存在" }, { status: 404 });
  }

  // 清理失败记录
  await prisma.variantProblem.deleteMany({
    where: { sourceId: problemId, genStatus: "failed" },
  });

  // 已有多少 ready/generating 变形题（同时获取标题，用于去重提示）
  const existing = await prisma.variantProblem.findMany({
    where: { sourceId: problemId, genStatus: { in: ["ready", "generating"] } },
    select: { id: true, genStatus: true, title: true },
  });

  const readyCount      = existing.filter((v) => v.genStatus === "ready").length;
  const generatingCount = existing.filter((v) => v.genStatus === "generating").length;
  const needed = TARGET_VARIANTS_PER_PROBLEM - readyCount - generatingCount;

  // 收集已有标题，生成新变形题时传入避免重复
  const usedTitles: string[] = existing
    .filter((v) => v.title && v.title !== "生成中...")
    .map((v) => v.title);

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* 客户端已断开，静默忽略，生成继续 */ }
      }

      // 每 20 秒发一条 SSE 注释，防止 Railway 代理因空闲超时断开连接
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* ignore */ }
      }, 20_000);

      if (needed <= 0) {
        clearInterval(keepalive);
        send({ done: true, message: `已有 ${readyCount} 道 ready 变形题，无需生成` });
        controller.close();
        return;
      }

      send({ step: "start", message: `开始为「${problem.title}」生成 ${needed} 道变形题` });

      let successCount = 0;

      for (let i = 1; i <= needed; i++) {
        // 占位记录，防并发重复触发
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

          // 只保留通过复核的测试点
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

          usedTitles.push(draft.title); // 本批次后续生成时回避该标题
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

      clearInterval(keepalive);
      send({ done: true, message: `全部完成，成功生成 ${successCount}/${needed} 道变形题` });
      controller.close();
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

// ─── 批量生成 ─────────────────────────────────────────────────────────────────

async function handleBatch(request: NextRequest): Promise<Response> {
  // 找所有 ready 变形题不足 4 道的题目
  const allProblems = await prisma.problem.findMany({
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

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* 客户端已断开，静默忽略，生成继续 */ }
      }

      // keepalive：防止 Railway 代理因空闲超时断开连接
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* ignore */ }
      }, 20_000);

      if (needProblems.length === 0) {
        clearInterval(keepalive);
        send({ done: true, message: "所有题目已有 4 道变形题，无需生成" });
        controller.close();
        return;
      }

      send({ step: "start", message: `共 ${needProblems.length} 道题需要补充变形题` });

      for (let pi = 0; pi < needProblems.length; pi++) {
        const p = needProblems[pi];
        send({ step: "problem", current: pi + 1, total: needProblems.length, message: `处理题目 ${pi + 1}/${needProblems.length}：${p.title}` });

        // 复用单题逻辑：直接调用 handleSingle 并消费其 stream
        const singleResponse = await handleSingle(p.id);
        const reader = singleResponse.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // 透传每道题的进度事件（已包含单题的 keepalive）
            try { controller.enqueue(value); } catch { /* ignore */ }
          }
        }
      }

      clearInterval(keepalive);
      send({ done: true, message: `批量生成完毕，处理了 ${needProblems.length} 道题` });
      controller.close();
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

// ─── GET：查询所有题目的变形题状态 ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
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

  // 汇总：每道题的 ready/generating/failed 数量
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
