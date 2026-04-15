import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { verifyVariant } from "@/lib/variantverify";

/**
 * POST /api/admin/variants/verify
 * 复核变形题样例和测试点的正确性。
 *
 * Body: { variantId: number }         — 复核单道变形题
 * Body: { problemId: number }         — 复核某道真题下所有变形题
 * Query: ?batch=1                     — 复核所有变形题
 * Query: ?batch=1&level=5             — 复核指定级别的所有变形题
 *
 * SSE 流式返回进度。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const isBatch = url.searchParams.get("batch") === "1";
  const levelParam = url.searchParams.get("level");
  const body = await request.json().catch(() => ({}));

  // 收集要复核的变形题 ID
  let variantIds: number[] = [];

  if (body.variantId) {
    variantIds = [parseInt(body.variantId)];
  } else if (body.problemId) {
    const variants = await prisma.variantProblem.findMany({
      where: { sourceId: parseInt(body.problemId), genStatus: "ready" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    variantIds = variants.map((v) => v.id);
  } else if (isBatch) {
    const where: { genStatus: string; level?: number } = { genStatus: "ready" };
    if (levelParam) where.level = parseInt(levelParam);
    const variants = await prisma.variantProblem.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    variantIds = variants.map((v) => v.id);
  }

  if (variantIds.length === 0) {
    return Response.json({ error: "没有找到需要复核的变形题" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* 客户端已断开 */ }
      }

      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* ignore */ }
      }, 20_000);

      send({ step: "start", message: `开始复核 ${variantIds.length} 道变形题` });

      let passCount = 0;
      let fixedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < variantIds.length; i++) {
        const vid = variantIds[i];

        // 加载完整变形题数据
        const variant = await prisma.variantProblem.findUnique({
          where: { id: vid },
          select: {
            id: true, title: true, description: true,
            inputFormat: true, outputFormat: true,
            samples: true, testCases: true,
          },
        });

        if (!variant) {
          send({ step: "skip", current: i + 1, total: variantIds.length, variantId: vid, message: "变形题不存在，跳过" });
          continue;
        }

        send({ step: "verifying", current: i + 1, total: variantIds.length, variantId: vid, title: variant.title, message: `复核中...` });

        try {
          const result = await verifyVariant(variant);

          if (result.status === "pass") {
            passCount++;
            // 更新 verifiedAt 时间戳
            await prisma.variantProblem.update({
              where: { id: vid },
              data: { verifiedAt: new Date() },
            });
            send({
              step: "result", current: i + 1, total: variantIds.length,
              variantId: vid, title: variant.title,
              status: "pass",
              message: result.message,
            });
          } else if (result.status === "fixed") {
            fixedCount++;
            // 写入修复后的数据
            const updateData: Record<string, unknown> = { verifiedAt: new Date() };
            if (result.fixedSamples) updateData.samples = result.fixedSamples;
            if (result.fixedTestCases) {
              updateData.testCases = result.fixedTestCases;
              const cleaned = JSON.parse(result.fixedTestCases);
              updateData.verifiedCount = cleaned.length;
            }
            await prisma.variantProblem.update({
              where: { id: vid },
              data: updateData,
            });
            send({
              step: "result", current: i + 1, total: variantIds.length,
              variantId: vid, title: variant.title,
              status: "fixed",
              sampleFixed: result.sampleFixed,
              testRemoved: result.testRemoved,
              message: result.message,
            });
          } else {
            failedCount++;
            send({
              step: "result", current: i + 1, total: variantIds.length,
              variantId: vid, title: variant.title,
              status: "failed",
              message: result.message,
            });
          }
        } catch (e: any) {
          failedCount++;
          console.error(`[VariantVerify] 变形题 ${vid} 复核异常:`, e.message);
          send({
            step: "error", current: i + 1, total: variantIds.length,
            variantId: vid, title: variant.title,
            message: `复核异常: ${e.message}`,
          });
        }
      }

      clearInterval(keepalive);
      send({
        done: true,
        message: `复核完成：${passCount} 通过，${fixedCount} 已修复，${failedCount} 需人工检查`,
        passCount,
        fixedCount,
        failedCount,
        total: variantIds.length,
      });
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
