import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fetchLuoguProblem } from "@/lib/luogu";

/**
 * POST /api/admin/problems/retag
 * 流式返回进度，避免长时间请求超时
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const forceAll = body.all === true;

  const problems = await prisma.problem.findMany({
    where: forceAll ? undefined : { tags: "[]" },
    select: { id: true, luoguId: true },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      if (problems.length === 0) {
        send({ done: true, message: "所有题目已有标签，无需回填" });
        controller.close();
        return;
      }

      let success = 0;
      let failed = 0;

      for (let i = 0; i < problems.length; i++) {
        const { id, luoguId } = problems[i];
        try {
          const data = await fetchLuoguProblem(luoguId);
          await prisma.problem.update({ where: { id }, data: { tags: data.tags } });
          const tags = JSON.parse(data.tags) as string[];
          success++;
          send({ luoguId, tags, status: "ok", current: i + 1, total: problems.length });
        } catch (e: any) {
          failed++;
          send({ luoguId, status: "error", error: e.message, current: i + 1, total: problems.length });
        }
        if (i < problems.length - 1) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }

      send({ done: true, message: `回填完成：成功 ${success}，失败 ${failed}，共 ${problems.length} 题` });
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
